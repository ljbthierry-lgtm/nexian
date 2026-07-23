/** Save the address and token, then prove they work by calling /api/ext/whoami. */

const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["baseUrl", "token"]).then(({ baseUrl, token }) => {
  if (baseUrl) $("baseUrl").value = baseUrl;
  if (token) $("token").value = token;
});

$("save").addEventListener("click", async () => {
  const baseUrl = $("baseUrl").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  const state = $("state");

  if (!baseUrl || !token) {
    state.className = "state warn";
    state.textContent = "Both the address and a token are needed.";
    return;
  }
  await chrome.storage.local.set({ baseUrl, token });
  state.className = "state";
  state.textContent = "Saved — testing…";

  chrome.runtime.sendMessage({ type: "whoami" }, (res) => {
    if (res?.ok && res.data?.ok) {
      state.className = "state good";
      state.textContent = `Connected as ${res.data.name} (${res.data.email}).`;
    } else if (res?.error === "unauthorized") {
      state.className = "state warn";
      state.textContent = "The token was rejected. Generate a fresh one in Nexian.";
    } else {
      state.className = "state warn";
      state.textContent = "Could not reach that address. Check it and try again.";
    }
  });
});
