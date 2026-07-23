# Handoff — Nexian Talent Pool

Read this first if you're picking the project up in a fresh session. `README.md`
explains the product and its rules; this file is the operational state: what's
live, what's pending, and the traps.

## What it is

A freelancer outreach CRM + self-service profiles + consent-gated campaigns, for
Nexian (a consulting firm). One Cloudflare Worker (Hono) + one D1 database +
a React/Vite SPA served as static assets. **Not** the contract-suite base64
monolith — this is the modular `src/worker/modules/*` pattern.

## Live state (as of 2026-07-23)

- **Live:** https://nexian-talent-pool.ljbthierry.workers.dev
- **Repos (push to BOTH):**
  - `origin` → github.com/ljbthierry-lgtm/nexian-talent-pool (private)
  - `nexian` → github.com/ljbthierry-lgtm/nexian (PUBLIC)
- **Cloudflare account:** ljbthierry@gmail.com · D1 `nexian_talent`
  (id in `wrangler.toml`) · Worker `nexian-talent-pool` · cron daily 07:00 UTC.
- **Migrations 0001–0013 applied** to remote D1.
- **Deploy is manual:** `npm run migrate:prod && npm run deploy`. Push to `main`
  does NOT auto-deploy (no `CLOUDFLARE_API_TOKEN` GitHub secret) — CI runs
  tests/build only.

## ⚠ Owner actions still outstanding (surface these when relevant)

1. **No admin account exists yet.** `GET /api/auth/state` → `needsBootstrap:true`.
   Create the first admin at the URL with the `SETUP_KEY`. The current SETUP_KEY
   is in `%TEMP%\claude\nexian_setup_key.txt` (rotated 2026-07-22 after the
   original was printed in a transcript). Bootstrap self-seals after first use.
2. **`RESEND_API_KEY` is NOT set.** Until it is: no email sends at all (logged as
   skipped) AND staff 2FA is inactive (degrades visibly — the login page says
   so). Setting it unblocks the whole invitation feature and turns 2FA on.
3. **`RESEND_WEBHOOK_SECRET` is NOT set** — bounce/complaint webhook fails closed
   (503) until it's set from Resend's dashboard.
4. **Owner chose the throwaway admin password `Password123`** while the DB is
   empty; must be changed before real freelancer data. It's the *only* protection
   until 2FA (i.e. RESEND) is on.
5. **Domain:** still on `*.workers.dev`. Owner will move to a Nexian-branded
   domain for production. On that move: set `BASE_URL`, add SPF/DKIM/DMARC, and
   update the extension's `manifest.json` host_permissions + each user's saved
   options URL.

## No live end-to-end yet

Because no admin exists, nothing session-authed has been clicked through on the
live site. All verification so far has been: unit tests (271), typecheck, build,
and direct API probes against production (auth boundaries, field storage, webhook
signatures). **First thing once an admin is bootstrapped:** import a ~5-row test
CSV and watch it move through Invitations before the real 350-person list.

## Verification hygiene (learned the hard way)

- **Edge propagation lag:** the first request within ~5–10 s of `wrangler deploy`
  or `wrangler secret put` can hit a STALE isolate running the old code. Fields
  will look unstored, endpoints will 401/503 wrongly. **Poll/retry ~6 s before
  concluding a bug.** Hit this 4+ times.
- **Register rate limit is 5/hour/IP.** Verification registrations exhaust it;
  clear it with `DELETE FROM rate_limits WHERE key LIKE 'register:%'` (the table
  keys by `key`, there is no `bucket` column).
- **Prod verification rows can't be hard-deleted** — the append-only `activity`
  trigger blocks the cascade. Anonymise them to tombstones instead
  (`anonymized_at`, blanked names, `deleted+id@invalid`); live counts return to 0
  but tombstone rows persist by design. Live pool is currently 0 contacts /
  0 profiles (all probes cleaned up).
- `wrangler secret delete` crashes on Windows (libuv assertion) — pipe `echo y |`
  and it still works.

## Invariants — do NOT weaken

- **Consent:** contacts we add are opted OUT by construction (no consent rows).
  Consent is granted only by the freelancer on `/join`, 3 unticked boxes.
  `consents` is append-only; `consent_current` view = latest per (contact,
  purpose). Campaign audiences come ONLY from `buildAudienceQuery` (joins the
  view + `granted=1` + verified + emailable). No override widens a send.
- **Double opt-in:** `profiles.verified_at` stamped when a `portal_link` token is
  opened; required by `buildAudienceQuery`. Unverified people show in the pool
  marked "Unverified — not mailed".
- **A hard bounce NEVER suppresses** (fact vs choice); a spam complaint does.
  `lib/deliverability.ts`.
- **Suppression is a SHA-256 hash kept forever**, separate from the contact row,
  so an opt-out survives deletion/re-import. Email AND LinkedIn identities.
- **Outreach cap = 2 touches**, shared across email + LinkedIn, hard stop on
  reply/registration/opt-out. One decision fn: `decideOutreach` in
  `modules/outreach/eligibility.ts`, used by manual send, cron, wave AND the
  extension endpoint.
- **Append-only tables** (`consents`, `activity`, `access_log`) have DB triggers;
  ⚠ an append-only table can't hold an FK to a mutable one (learned on
  `access_log` — no FK, snapshot the name instead).
- **PBKDF2 ≤ 100000** iterations (Workers WebCrypto rejects more).
- **Two cookies:** `nx_session` (staff) vs `nx_portal` (freelancer). Never cross.
- **No public endpoint issues a session**, and public endpoints answer
  identically for known/unknown addresses (enumeration).
- **`src/web/profileFields.ts` mirrors `src/worker/lib/profileFields.ts`** — the
  parity test enforces it.

## Auth surfaces (mounting order matters — see `index.ts`)

- `/api/auth/*`, `/api/public/*`, `/api/portal/*` — public / own-cookie.
- `/api/webhooks/*` — HMAC-signed (Resend), no session.
- `/api/ext/*` — **personal bearer token** (`api_tokens`), no session; the OPTIONS
  preflight must bypass the token gate (it carries no auth header).
- everything else under `/api/*` — staff session. Note `/api/exttokens` (token
  *management*, session-authed) is deliberately NOT under the `/api/ext/` bypass.

## The LinkedIn extension (this session's big add)

- `extension/` = MV3 Chrome/Edge extension. Background service worker holds the
  token + base URL and does the cross-origin fetch (host_permissions bypass CORS,
  so no preflight in practice). Content script injects a "Nexian" button on
  `linkedin.com/in/*` and `/sales/*`; click → `/api/ext/lookup?url=` → copies the
  prepared message → "Mark as sent" → `/api/ext/sent`.
- **Compliance line:** it PREPARES and RECORDS only. It never types into or sends
  from LinkedIn. Do not add auto-typing/auto-send — that's the ToS violation the
  whole design avoids.
- Tokens minted at Settings → Browser extension (recruiters get a slimmed
  Settings showing just this + password). Install steps in `extension/README.md`.
- The only *fully compliant* true automation would be LinkedIn's paid Recruiter/
  Sales Navigator APIs (partner-gated, licensed) — not built; flagged to owner.

## Feature map (where things live)

- Invitations page: `src/web/pages/Invitations.tsx` (wave, queue, funnel, replies)
- Contacts (record book): `src/web/pages/Contacts.tsx` (exports LinkedInModal +
  ImportModal, still used by Invitations)
- Wave engine: `modules/outreach/wave.ts`; shared sender: `modules/outreach/send.ts`
- Funnel status (one derivation): `lib/inviteStatus.ts`
- Personalised pre-filled invite links: `join_prefill` token → `/join?invite=`,
  `GET /api/public/join-prefill`, adopt-on-register in `publicsite/routes.ts`
- Profile fields: `lib/profileFields.ts` (+ web mirror) — languages graded
  FR/NL/EN, provinces+remote mobility, work regime, notice period; certifications
  + skills + industries are taxonomy (searchable `SearchSelect`; industries have
  no custom, per owner)
- 2FA: `lib/mfa.ts`; access log + alerts: `lib/accessLog.ts` + `lib/alerts.ts`
- Preview (admin sees the freelancer's view): `src/web/pages/Preview.tsx`

## Known-open / possible next work

- **Industries are free-form server-side** — the form blocks custom entries, but
  a raw API call can still send an arbitrary industry (as for skills). Add
  server-side taxonomy validation if airtight enforcement is wanted.
- Profile *views* aren't logged (downloads/exports are) — deliberate (staff-
  monitoring decision); `access_log` action enum is pre-widened for it.
- Reply detection is manual until Email Routing is set up on a real domain.
- Extension is unpacked-install only; Chrome Web Store submission is optional.

## Commands

```bash
npm run ci            # format check + typecheck + tests + build (the gate)
npm test              # 271 unit tests
npm run migrate:prod  # apply migrations to remote D1
npm run deploy        # build + wrangler deploy
# push to BOTH remotes:
git push origin main && git push nexian main
```

Git identity in this repo: `Laurent Thierry <laurent@tandempartners.be>`
(set it locally or commits fail). Commit trailer:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
