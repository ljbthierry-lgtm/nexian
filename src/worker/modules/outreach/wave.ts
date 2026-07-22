/**
 * The invite wave: "invite everyone on the list" turned into a paced drip.
 *
 * One button starts it; the nightly job then sends a bounded batch of first
 * invitations until the list is exhausted, and switches itself off. Pacing is
 * not politeness theatre — a fresh sender domain that suddenly emails hundreds
 * of strangers in an hour is how mail providers learn to junk everything the
 * domain will ever send. Forty a day keeps the volume boring.
 *
 * The wave holds no list of its own. Every run re-selects "who has never been
 * touched" from the contacts table and re-decides eligibility per person, so
 * someone who registers, opts out or gets a manual invite between runs is
 * simply no longer selected. Pausing is just switching the flag off; nothing
 * needs unwinding.
 */
import type { Env } from "../../env";
import { all, first, run } from "../../lib/db";
import { log } from "../../lib/log";
import { type OutreachCandidateRow, sendOutreachTo } from "./send";

const SETTINGS_KEY = "invite_wave";

/** Ceiling per cron invocation, matching the campaign sender's batch cap. */
export const MAX_WAVE_PER_RUN = 40;
export const DEFAULT_DAILY_LIMIT = 40;

export interface WaveState {
  active: boolean;
  dailyLimit: number;
  startedAt: string | null;
  /** Set when the wave switches itself off because nobody was left. */
  completedAt: string | null;
}

const IDLE: WaveState = {
  active: false,
  dailyLimit: DEFAULT_DAILY_LIMIT,
  startedAt: null,
  completedAt: null,
};

export async function readWave(db: D1Database): Promise<WaveState> {
  const row = await first<{ value: string }>(
    db,
    `SELECT value FROM settings WHERE key = ?`,
    SETTINGS_KEY,
  );
  if (!row) return { ...IDLE };
  try {
    const parsed = JSON.parse(row.value) as Partial<WaveState>;
    return {
      active: parsed.active === true,
      dailyLimit: clampLimit(parsed.dailyLimit),
      startedAt: parsed.startedAt ?? null,
      completedAt: parsed.completedAt ?? null,
    };
  } catch {
    return { ...IDLE };
  }
}

export async function writeWave(db: D1Database, state: WaveState): Promise<void> {
  await run(
    db,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    SETTINGS_KEY,
    JSON.stringify(state),
  );
}

export function clampLimit(value: unknown): number {
  const n =
    typeof value === "number" ? Math.floor(value) : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_DAILY_LIMIT;
  return Math.min(Math.max(n, 1), 100);
}

/**
 * First invitations only — follow-ups belong to their own nightly job. Email is
 * the wave's channel, so LinkedIn-only prospects never appear here; they are
 * the manual queue's population.
 */
const WAVE_SELECT = `
  SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
         ct.anonymized_at, ct.outreach_count, ct.last_outreach_at,
         (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
  FROM contacts ct
  WHERE ct.suppressed = 0
    AND ct.anonymized_at IS NULL
    AND ct.email IS NOT NULL
    AND ct.outreach_count = 0
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)
  ORDER BY ct.created_at ASC`;

export async function countWaveRemaining(db: D1Database): Promise<number> {
  const row = await first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM (${WAVE_SELECT})`);
  return row?.n ?? 0;
}

/** One nightly step. Returns what happened, for the log and the wave card. */
export async function runInviteWave(
  env: Env,
  now = new Date(),
): Promise<{ sent: number; remaining: number; finished: boolean }> {
  const state = await readWave(env.DB);
  if (!state.active) return { sent: 0, remaining: 0, finished: false };

  const batch = Math.min(state.dailyLimit, MAX_WAVE_PER_RUN);
  const rows = await all<OutreachCandidateRow>(env.DB, `${WAVE_SELECT} LIMIT ?`, batch);

  let sent = 0;
  for (const row of rows) {
    // Eligibility is re-decided per person inside, so the wave can never
    // out-run the touch cap or mail someone who opted out this morning.
    const result = await sendOutreachTo(env, row, env.COMPANY_NAME, null, now);
    if (result.sent) sent++;
  }

  const remaining = await countWaveRemaining(env.DB);
  const finished = remaining === 0;
  if (finished) {
    await writeWave(env.DB, {
      ...state,
      active: false,
      completedAt: now.toISOString(),
    });
    log.info("wave.completed", { sent });
  } else {
    log.info("wave.step", { sent, remaining });
  }
  return { sent, remaining, finished };
}
