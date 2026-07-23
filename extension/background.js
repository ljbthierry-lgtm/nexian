/**
 * Service worker: the only place that talks to the Nexian app.
 *
 * A content script on linkedin.com cannot call our app directly — the page's
 * CORS and CSP would block it. The service worker can, because the extension
 * declares host_permissions for the app. So the content script asks the worker,
 * and the worker holds the token and the base URL and makes the request.
 *
 * The worker calls exactly two endpoints, both of which only PREPARE or RECORD.
 * Nothing here ever touches LinkedIn.
 */

async function config() {
  const { baseUrl, token } = await chrome.storage.local.get(["baseUrl", "token"]);
  return { baseUrl: (baseUrl || "").replace(/\/$/, ""), token: token || "" };
}

async function callApi(path, options = {}) {
  const { baseUrl, token } = await config();
  if (!baseUrl || !token) {
    return { ok: false, error: "not_configured" };
  }
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) return { ok: false, error: "unauthorized" };
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, error: "network", detail: String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "lookup") {
      const params = new URLSearchParams({ url: msg.url });
      if (msg.focus) params.set("focus", msg.focus);
      sendResponse(await callApi(`/api/ext/lookup?${params.toString()}`));
    } else if (msg?.type === "markSent") {
      sendResponse(
        await callApi(`/api/ext/sent`, {
          method: "POST",
          body: JSON.stringify({ contactId: msg.contactId }),
        }),
      );
    } else if (msg?.type === "whoami") {
      sendResponse(await callApi(`/api/ext/whoami`));
    } else {
      sendResponse({ ok: false, error: "unknown_message" });
    }
  })();
  // Keep the message channel open for the async response.
  return true;
});
