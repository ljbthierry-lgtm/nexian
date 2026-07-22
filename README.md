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

LinkedIn has no API for messaging people, and automating its interface breaks
their terms and risks the sender's own account. So the app writes the message
and tracks who received one; a human pastes and sends it. Marking it sent counts
as one of the two allowed touches, so email and LinkedIn share a single budget.

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
    contacts/        the CRM: list, import, notes, suppression
    outreach/        invite sequence + LinkedIn queue
    pool/            the talent pool table and its filters
    campaigns/       compose, preview audience, send
    admin/           team, taxonomy, retention, email log
    notifications/   Resend client, templates, action tokens
src/web/             React SPA (staff back office + public pages)
test/                unit tests for the rules that must not drift
```

Two identities, two cookies: `nx_session` for staff, `nx_portal` for a
freelancer who followed a magic link. A portal cookie can never satisfy a back
office route.

Email buttons land on `GET /a/:token`, which **renders** a page; the mutation
happens on `POST`. Corporate mail scanners fetch every URL in an incoming
message, so a magic link that acted on GET would be spent before the person
clicked it.

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
