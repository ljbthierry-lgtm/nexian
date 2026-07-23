/**
 * The button on a LinkedIn profile, and the little panel behind it.
 *
 * What it does when clicked: reads the profile URL from the address bar, asks
 * the app (via the service worker) for the prepared message for that person,
 * and puts it on the clipboard. What it never does: type into LinkedIn's boxes
 * or click LinkedIn's buttons. Sending stays a human action — that is the whole
 * compliance line, and it is drawn here on purpose.
 */
(() => {
  const BTN_ID = "nexian-helper-btn";
  const PANEL_ID = "nexian-helper-panel";

  function currentProfileUrl() {
    // The canonical /in/ or /sales/ URL of the profile being viewed.
    const path = location.pathname;
    if (/^\/(in|sales)\//.test(path)) return location.origin + path;
    return null;
  }

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    if (!currentProfileUrl()) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.textContent = "Nexian";
    btn.title = "Copy the Nexian invitation for this person";
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
  }

  function panel() {
    let el = document.getElementById(PANEL_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = PANEL_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  }

  function render(html) {
    const el = panel();
    el.innerHTML = `<div class="nx-card">${html}<button class="nx-close" aria-label="Close">×</button></div>`;
    el.querySelector(".nx-close").addEventListener("click", () => (el.innerHTML = ""));
    return el;
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function onClick() {
    const url = currentProfileUrl();
    if (!url) return;
    render(`<p class="nx-muted">Looking this person up…</p>`);
    chrome.runtime.sendMessage({ type: "lookup", url }, (res) => {
      if (!res || !res.ok) {
        const msg =
          res?.error === "not_configured"
            ? "Open the extension options and paste your Nexian address and token first."
            : res?.error === "unauthorized"
              ? "Your token was rejected — generate a new one in Nexian → Settings → Browser extension."
              : "Could not reach Nexian. Check your connection and the address in options.";
        render(`<p class="nx-warn">${esc(msg)}</p>`);
        return;
      }
      const d = res.data;
      if (!d.found) {
        const why =
          d.reason === "not_in_pool"
            ? "This person is not in your Nexian pool yet. Add them in the app first."
            : "This does not look like a personal LinkedIn profile.";
        render(`<p class="nx-muted">${esc(why)}</p>`);
        return;
      }
      if (d.alreadyRegistered) {
        render(
          `<p class="nx-good">${esc(d.contact.name)} has already registered in the pool — no need to message them.</p>`,
        );
        return;
      }
      if (d.blocked) {
        render(`<p class="nx-warn">${esc(d.reason || "Do not contact this person.")}</p>`);
        return;
      }
      showMessage(d);
    });
  }

  function showMessage(d) {
    const allowed = !d.decision || d.decision.allowed;
    const note = d.decision && !d.decision.allowed ? d.decision.reason : "";
    const el = render(`
      <div class="nx-head">Invite ${esc(d.contact.name)}</div>
      ${note ? `<p class="nx-warn">${esc(note)}</p>` : ""}
      <label class="nx-label">Message (already copied)</label>
      <textarea class="nx-text" rows="7" readonly>${esc(d.message)}</textarea>
      <div class="nx-row">
        <button class="nx-btn nx-copy-msg">Copy message</button>
        <button class="nx-btn nx-copy-note">Copy connection note</button>
      </div>
      <p class="nx-muted">Paste it into LinkedIn, send it yourself, then:</p>
      <button class="nx-btn nx-deep nx-sent" ${allowed ? "" : "disabled"}>Mark as sent</button>
      <p class="nx-sent-state"></p>
    `);

    // Copy the message immediately, so the common path is truly one click.
    void copy(d.message);

    el.querySelector(".nx-copy-msg").addEventListener("click", () => void copy(d.message));
    el.querySelector(".nx-copy-note").addEventListener("click", () => void copy(d.connectionNote));
    el.querySelector(".nx-sent").addEventListener("click", (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      chrome.runtime.sendMessage({ type: "markSent", contactId: d.contact.id }, (res) => {
        const state = el.querySelector(".nx-sent-state");
        if (res?.ok) state.innerHTML = `<span class="nx-good">Recorded as sent in Nexian.</span>`;
        else {
          b.disabled = false;
          state.innerHTML = `<span class="nx-warn">Could not record it — try again.</span>`;
        }
      });
    });
  }

  // LinkedIn is a single-page app: the profile changes without a full reload, so
  // re-check on navigation and on DOM churn rather than only at first load.
  ensureButton();
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      const old = document.getElementById(PANEL_ID);
      if (old) old.innerHTML = "";
      ensureButton();
    }
  }, 1000);
})();
