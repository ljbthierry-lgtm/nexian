# Nexian Talent Pool

Freelancer outreach, self-service profiles and consent-gated campaigns — one
Cloudflare Worker, one D1 database, no third-party CRM.

The point of the app is a pool of freelancers we can call when a mission fits:
we find people, invite them once (twice at most), they register themselves, and
from then on they keep their own rate, availability and CV current.

## How consent works

This is the part to understand before changing anything.

- **Everyone we add ourselves is opted out.** Imports, LinkedIn research and
  referrals all create a contact with no consent rows at all. There is no
  "mark as consented" button, and a spreadsheet column saying *agreed* is
  ignored on import.
- **Consent is granted by the freelancer, on the platform.** The registration
  form has three separate boxes — store my profile (required), mission alerts
  (optional), company news (optional) — none of them pre-ticked.
- **And the address has to be proven.** Registration is a public form, so anyone
  can submit it with somebody else's address; a consent row on its own only
  shows that *somebody typed* an address. A profile therefore starts unverified
  and is stamped when the personal link we emailed is opened — something only
  the mailbox owner can do. Campaign audiences require the stamp. Unverified
  people still appear in the pool for recruiters, clearly marked, because they
  are real leads; they simply are not mailed.
- **The ledger is append-only.** `consents` is never updated or deleted; the
  `consent_current` view resolves the latest decision per purpose. That way we
  can always show what someone agreed to, when, and against which policy
  version.
- **Campaign audiences come from `buildAudienceQuery`**, which joins that view
  and requires `granted = 1`. There is no flag, parameter or admin override
  anywhere that widens a send beyond it.
- **Cold outreach is capped**: two touches, a waiting period between them, and
  an automatic stop on reply, registration or opt-out. Every message says where
  we got the person's details and carries a one-click opt-out.
- **Opt-outs outlive the record.** Suppression is also stored as a SHA-256 of
  the address in `suppression_list`, so a person who opted out cannot be
  re-imported from a fresh list months later. The list holds no readable
  addresses.
- **Retention**: prospects who never registered are anonymised automatically
  after `PROSPECT_RETENTION_DAYS`. The consent and activity trail survives as
  proof we contacted them lawfully and then cleaned up.

## LinkedIn

LinkedIn has no compliant API for messaging arbitrary people, and automating its
interface breaks their terms and risks the sender's own account. So the app
writes the message and tracks who received one; a human pastes and sends it.
Marking it sent counts as one of the two allowed touches, so email and LinkedIn
share a single budget.

The **browser extension** in `extension/` makes this one click: on a LinkedIn
profile it copies the prepared, personalised message for that person and records
the touch. It never types into or sends from LinkedIn — that line is the whole
compliance story. See `extension/README.md`. It authenticates with a personal
bearer token (`api_tokens`), minted per staff member under **Settings → Browser
extension**, and calls `/api/ext/*` (bearer-authed, outside the session guard).

## The two outreach screens

- **Invitations** is the campaign desk: import a list, run the paced email
  **wave**, work the **LinkedIn queue**, see the funnel (not invited → invited →
  registered → declined), record replies. This is where sending happens.
- **Contacts** is the record book: the full row for everyone, notes, consent
  history, per-record access log, import and CSV export. No sending controls —
  they were deliberately moved to Invitations so the two screens stop
  overlapping.

## Deliverability, replies, alerts

- **Bounces/complaints** arrive by signed Resend webhook (`/api/webhooks/resend`,
  HMAC-verified, replay-guarded, idempotent). A hard bounce marks the address
  undeliverable and stops email but **never suppresses** — a dead mailbox is a
  fact, not a choice. A spam complaint **does** suppress permanently. See
  `lib/deliverability.ts`; `EMAILABLE_SQL` / `isEmailable` gate every send path.
- **Replies** stop the sequence. Recorded by hand today (interested / not now /
  not interested); an inbound Email Worker (`modules/inbound/email.ts`) does it
  automatically once a real domain routes mail to the Worker — it refuses to
  treat an out-of-office as a reply.
- **Bulk-export alerting** (`lib/alerts.ts`): a large or repeated export raises a
  DB-first, email-second alert shown on Settings → Access log.

## Layout

```
migrations/          D1 schema
src/worker/
  index.ts           Hono app, route mounting, error boundary
  cron.ts            nightly follow-ups, availability reminders, retention sweep
  lib/               crypto, db, consent ledger, segment builder, CV store, CSV,
                     suppression list, email + action-page HTML
  middleware/auth.ts staff sessions and portal sessions (separate cookies)
  modules/
    auth/            sign in, bootstrap, invitations
    publicsite/      registration, "email me my link"
    portal/          the freelancer's own profile, CV, export, delete
    actions/         /a/:token landing pages for email buttons
    contacts/        the record book: list, import, notes, suppression, CSV
    outreach/        invite wave, follow-ups, LinkedIn queue, send.ts (shared)
    pool/            the talent pool table and its filters
    campaigns/       compose, preview audience, send
    admin/           team, taxonomy, retention, email log, access log, alerts,
                     extension-token management, email/portal previews
    ext/             browser-extension API (bearer) + token management (session)
    inbound/         incoming-email reply detection (dormant until domain routes)
    notifications/   Resend client, webhook, templates, action tokens
  lib/               ...also: deliverability, alerts, mfa, apiToken, accessLog,
                     linkedinKey, inviteStatus, profileFields, webhookSignature,
                     csrf, replyMatch, labels
extension/           MV3 Chrome/Edge extension (manifest, background, content,
                     options) — the compliant LinkedIn one-click helper
src/web/             React SPA (staff back office + public pages)
test/                unit tests for the rules that must not drift
```

`src/web/profileFields.ts` mirrors `src/worker/lib/profileFields.ts` (language
levels, Belgian provinces + remote, work regimes, notice periods). A parity test
fails if the two drift, so a form can never offer a value the server then drops.

Two identities, two cookies: `nx_session` for staff, `nx_portal` for a
freelancer who followed a magic link. A portal cookie can never satisfy a back
office route.

**No public endpoint hands out a session.** Registration used to sign the caller
in so the CV could be uploaded in the same sitting. That was wrong: when the
address belonged to a contact that had no profile yet — every prospect we had
imported — it gave whoever knew that address a session over that person's
record, internal recruiter notes included. The CV now travels inside the
registration request instead, and reaching a profile always costs a click on a
link sent to the address itself.

**Public endpoints answer identically whatever they find.** Registration and
"email me my link" both return `{ok:true}` for a known and an unknown address,
because a different answer turns either form into a way to test whether a named
person is in the pool.

Email buttons land on `GET /a/:token`, which **renders** a page; the mutation
happens on `POST`. Corporate mail scanners fetch every URL in an incoming
message, so a magic link that acted on GET would be spent before the person
clicked it. The purpose is checked *before* the token is spent, or a link that
reached the wrong route would be burned and then rejected.

**Public and sign-in endpoints are throttled** (`lib/rateLimit.ts`). The limit
that matters most is per-target-address on "email me my link": without it,
anyone could point that form at a stranger and have us mail them repeatedly.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars      # add APP_ENV=development
npm run migrate:local
npx wrangler dev --port 8791 --local
```

Without `RESEND_API_KEY` and with `APP_ENV=development`, emails are logged
instead of sent, so no real freelancer can be contacted from a dev machine.

Create the first admin from the sign-in page, using the `SETUP_KEY` from
`.dev.vars`. That endpoint seals itself once a user exists.

```bash
npm test          # unit tests
npm run check     # typecheck
npm run ci        # format + typecheck + tests + build
```

## Deploying

```bash
npx wrangler d1 create nexian_talent      # once; put the id in wrangler.toml
npm run migrate:prod
npm run deploy
```

Then set the secrets:

```bash
npx wrangler secret put SETUP_KEY         # needed once, to create the first admin
npx wrangler secret put RESEND_API_KEY    # until this exists, no email is sent
```

`BASE_URL` in `wrangler.toml` is the origin used in email links. Left as the
placeholder, the Worker learns its own `*.workers.dev` origin from incoming
requests — only `workers.dev` hostnames are learnable, because a request URL
reflects a client-supplied `Host` header and anything else would let an attacker
poison the links we email out. Set it explicitly once a custom domain exists.

Pushing to `main` runs the GitHub Actions workflow; the deploy job stays skipped
until a `CLOUDFLARE_API_TOKEN` repository secret is added.

## Before real freelancers are contacted

- Set `RESEND_API_KEY`, and add SPF, DKIM and DMARC records for the sending
  domain — cold outreach from an unauthenticated domain goes straight to spam.
- Set `BASE_URL` to the real domain.
- Review the privacy notice at `/privacy` and bump `PRIVACY_POLICY_VERSION`
  whenever its substance changes; consents already given stay attributed to the
  version they were given under.

## A note on CV storage

CVs live in D1 as 512 KB chunks (`cv_chunks`), because this Cloudflare account
has no R2 entitlement. `src/worker/lib/cvStore.ts` is the only module that knows
this: reimplement `putCv` / `getCv` / `deleteCv` against a bucket binding and
nothing else has to change.
