# Nexian LinkedIn Helper (browser extension)

A Chrome/Edge extension that makes reaching a LinkedIn-only prospect one click
instead of a copy-paste-switch-tabs chore — **while staying inside LinkedIn's
terms**.

## What it does, and what it deliberately does not

On a LinkedIn profile page it shows a **Nexian** button. Click it and the
extension:

1. reads the profile URL you're viewing,
2. asks your Nexian app for the personalised invitation prepared for that
   person (with their own tracked registration link), and
3. copies the message to your clipboard, ready to paste.

You then paste it into LinkedIn and send it **yourself**, and click **Mark as
sent** so the app records the touch.

It never types into LinkedIn's message box, never clicks LinkedIn's send button,
and never opens or reads your LinkedIn messages. Automating those actions
violates LinkedIn's User Agreement and risks your account — so the extension
stops at "prepare and copy", and the human does the sending. That line is the
whole point.

## Install (unpacked, for your team)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and choose this `extension/` folder.
4. Click the extension's **Details → Extension options**.
5. Paste your **Nexian address** (e.g.
   `https://nexian-talent-pool.ljbthierry.workers.dev`) and a **token**.
   - Get a token in the app: **Settings → Browser extension → Generate a
     token**. It's shown once; copy it straight into the options.
6. Save & test — it should say "Connected as _you_".

Each team member installs it and uses **their own** token, so activity is
attributed to the right person and a token can be revoked without affecting
anyone else.

## Publishing to the Chrome Web Store (optional, later)

The unpacked install above is fine for a small team. To distribute it more
widely, zip this folder and submit it through the Chrome Web Store developer
dashboard; the `host_permissions` will need to name your production domain once
Nexian moves off `*.workers.dev`.

## If you change the Nexian domain

Update two places: the `host_permissions` entry in `manifest.json`, and the
address each user has saved in the extension options.
