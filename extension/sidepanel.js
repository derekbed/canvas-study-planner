"use strict";
const $ = id => document.getElementById(id);
const disclosure = $("disclosure"), ready = $("ready"), consent = $("data-consent"), next = $("continue");
function show(accepted) { disclosure.hidden = accepted; ready.hidden = !accepted; if (accepted) loadSchools(); }
async function ask(type, origin) {
  const response = await chrome.runtime.sendMessage({ type, origin });
  if (!response?.ok) throw new Error(response?.error?.message || "Coursewise could not update this school.");
  return response.data;
}
function renderSchools(origins) {
  $("schools").replaceChildren();
  if (!origins.length) { const row = document.createElement("li"); row.textContent = "No schools connected yet."; $("schools").append(row); return; }
  for (const origin of origins) {
    const row = document.createElement("li"), label = document.createElement("span"), remove = document.createElement("button");
    label.textContent = origin + " "; remove.type = "button"; remove.textContent = "Disconnect"; remove.className = "quiet";
    remove.setAttribute("aria-label", `Disconnect ${origin}`);
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try { renderSchools((await ask("cw:removeSchool", origin)).origins); $("school-status").textContent = `${origin} disconnected and its local course settings deleted. Reload open Canvas tabs.`; }
      catch (error) { $("school-status").textContent = error.message; remove.disabled = false; }
    });
    row.append(label, remove); $("schools").append(row);
  }
}
async function loadSchools() {
  try { renderSchools((await ask("cw:listSchools")).origins); }
  catch (error) { $("school-status").textContent = error.message; }
}
consent.addEventListener("change", () => { next.disabled = !consent.checked; });
next.addEventListener("click", async () => {
  if (!consent.checked) return;
  await chrome.storage.local.set({ cwDataConsent: true });
  show(true);
  $("ready-heading").focus();
});
$("school-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("school-url"), button = $("connect");
  let origin;
  try {
    const url = new URL(input.value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error();
    origin = url.origin;
  } catch { $("school-status").textContent = "Enter your school's HTTPS Canvas address."; return; }
  button.disabled = true; $("school-status").textContent = "Requesting access to this Canvas site…";
  try {
    // Request the exact school origin while this submit gesture is active.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) { $("school-status").textContent = "Access was not granted. Coursewise did not connect this school."; return; }
    renderSchools((await ask("cw:addSchool", origin)).origins);
    input.value = "";
    $("school-status").textContent = `${origin} connected. Reload its Canvas tabs to show Coursewise.`;
  } catch (error) { $("school-status").textContent = error.message; }
  finally { button.disabled = false; }
});
chrome.storage.local.get("cwDataConsent").then(data => show(data.cwDataConsent === true));
