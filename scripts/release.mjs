#!/usr/bin/env node
/**
 * One command that makes a release reproducible and permanent.
 *
 * `npm run release` runs the full gate, builds the exact worker bundle that will
 * ship, deploys it to Cloudflare, then saves that bundle plus a manifest under
 * `releases/vNNNN/`, commits it, tags the commit, and pushes both GitHub remotes.
 * So every deployed version is preserved twice — as a browsable file on disk and
 * as a tagged commit in git (local and remote) — and can be diffed or restored.
 *
 * Usage:
 *   npm run release -- --note "what changed"     full: gate → deploy → snapshot → tag → push
 *   npm run release:dry                          build the bundle + print the manifest only
 *   node scripts/release.mjs --no-deploy --cf-version <id>   record an already-live version
 *   node scripts/release.mjs --no-push           snapshot + tag locally, don't push
 *
 * Flags: --dry-run, --no-deploy, --no-push, --note "text", --cf-version <id>.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const RELEASES_DIR = join(ROOT, "releases");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const DRY_RUN = has("--dry-run");
const NO_DEPLOY = has("--no-deploy") || DRY_RUN;
const NO_PUSH = has("--no-push") || DRY_RUN;
const NOTE = valueOf("--note") ?? "";
const CF_VERSION_OVERRIDE = valueOf("--cf-version");

const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: "utf8", ...opts });
const shInherit = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "inherit" });
const say = (msg) => console.log(`\n▸ ${msg}`);

function assertCleanTree() {
  // Untracked files (e.g. an unrelated note) are fine; a modified or staged
  // TRACKED file is not — a release must reflect a real committed state.
  const dirty = sh("git status --porcelain")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("??"));
  if (dirty.length) {
    console.error(
      "✗ Working tree has uncommitted changes to tracked files. Commit them first,\n" +
        "  so the release captures a real committed state:\n" +
        dirty.map((l) => `    ${l}`).join("\n"),
    );
    process.exit(1);
  }
}

function nextVersion() {
  if (!existsSync(RELEASES_DIR)) return "v0001";
  const nums = readdirSync(RELEASES_DIR)
    .filter((n) => /^v\d+$/.test(n) && statSync(join(RELEASES_DIR, n)).isDirectory())
    .map((n) => Number.parseInt(n.slice(1), 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `v${String(next).padStart(4, "0")}`;
}

/** Build the exact worker bundle wrangler would deploy, without deploying. */
function buildBundle() {
  const out = join(tmpdir(), `nx-release-${process.pid}`);
  rmSync(out, { recursive: true, force: true });
  say("Building the worker bundle (wrangler --dry-run)…");
  sh(`npx wrangler deploy --dry-run --outdir "${out}"`, { stdio: ["ignore", "ignore", "inherit"] });
  const bundle = join(out, "index.js");
  if (!existsSync(bundle)) {
    console.error(`✗ Expected a bundle at ${bundle} but wrangler produced none.`);
    process.exit(1);
  }
  return { bundle, bytes: statSync(bundle).size };
}

function deploy() {
  say("Deploying to Cloudflare…");
  const output = sh("npx wrangler deploy");
  process.stdout.write(output);
  const m = output.match(/Current Version ID:\s*([0-9a-f-]+)/i);
  return m ? m[1] : null;
}

function ensureReadme() {
  const readme = join(RELEASES_DIR, "README.md");
  if (existsSync(readme)) return;
  writeFileSync(
    readme,
    "# Release history\n\n" +
      "One folder per deployed version, newest by number. Each holds `worker.js`\n" +
      "(the exact bundle that shipped) and `manifest.json` (version, date, git SHA,\n" +
      "Cloudflare Version ID). `index.json` is the same history as one list.\n\n" +
      "Created by `npm run release` — see `scripts/release.mjs`. Do not edit by hand.\n",
  );
}

function updateIndex(entry) {
  const indexFile = join(RELEASES_DIR, "index.json");
  let list = [];
  if (existsSync(indexFile)) {
    try {
      list = JSON.parse(readFileSync(indexFile, "utf8"));
    } catch {
      list = [];
    }
  }
  list.unshift(entry);
  writeFileSync(indexFile, JSON.stringify(list, null, 2) + "\n");
}

// ---------------------------------------------------------------- run

if (!DRY_RUN) assertCleanTree();

const branch = sh("git rev-parse --abbrev-ref HEAD").trim();
const gitSha = sh("git rev-parse HEAD").trim();
const version = nextVersion();

if (!DRY_RUN) {
  say(`Running the gate (npm run ci)…`);
  shInherit("npm run ci");
}

const { bundle, bytes } = buildBundle();

const cloudflareVersionId = NO_DEPLOY ? (CF_VERSION_OVERRIDE ?? null) : deploy();

const manifest = {
  version,
  date: new Date().toISOString(),
  branch,
  gitSha,
  gitShaShort: gitSha.slice(0, 10),
  cloudflareVersionId,
  deployed: !NO_DEPLOY,
  workerBytes: bytes,
  note: NOTE,
  tool: "scripts/release.mjs",
};

if (DRY_RUN) {
  say(`Dry run — would create release ${version}. Manifest:`);
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`\n(worker bundle: ${bytes} bytes at ${bundle}) — nothing written, deployed, or pushed.`);
  process.exit(0);
}

say(`Saving release ${version}…`);
const dir = join(RELEASES_DIR, version);
mkdirSync(dir, { recursive: true });
copyFileSync(bundle, join(dir, "worker.js"));
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
ensureReadme();
updateIndex({
  version,
  date: manifest.date,
  gitShaShort: manifest.gitShaShort,
  cloudflareVersionId,
  deployed: manifest.deployed,
  note: NOTE,
});

const tagMsg = `Release ${version} — ${manifest.gitShaShort}${cloudflareVersionId ? ` — CF ${cloudflareVersionId}` : ""}${NOTE ? ` — ${NOTE}` : ""}`;
sh(`git add "${RELEASES_DIR}"`);
sh(`git commit -m "${tagMsg.replace(/"/g, "'")}"`);
sh(`git tag -a ${version} -m "${tagMsg.replace(/"/g, "'")}"`);
say(`Committed and tagged ${version}.`);

if (NO_PUSH) {
  say(`Skipping push (--no-push). Push when ready:\n    git push origin ${branch} --follow-tags && git push nexian ${branch} --follow-tags`);
} else {
  for (const remote of ["origin", "nexian"]) {
    try {
      say(`Pushing to ${remote}…`);
      shInherit(`git push ${remote} ${branch} --follow-tags`);
    } catch {
      console.error(`✗ Push to ${remote} failed — run it yourself:\n    git push ${remote} ${branch} --follow-tags`);
    }
  }
}

const doneVerb = NO_DEPLOY ? "recorded (not re-deployed)" : "deployed";
say(`Done: ${version} ${doneVerb}, saved under releases/${version}/, tagged, and committed.`);
