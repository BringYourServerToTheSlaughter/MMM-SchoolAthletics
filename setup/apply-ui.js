/* Optional localhost helper integration; copying remains available without it. */
(function () {
  "use strict";
  const button = document.getElementById("apply-config");
  const status = document.getElementById("apply-status");
  let target;
  let busy = false;
  function state() {
    return Object.fromEntries(Object.keys(SchoolAthleticsSetup.initialState("UTC")).map(key => {
      const control = document.getElementById(key);
      return [key, control.type === "checkbox" ? control.checked : control.value];
    }));
  }
  function update() { button.disabled = busy || !target || !SchoolAthleticsSetup.generate(state()).output; }
  for (const id of ["setup-form", "outputMode"]) for (const event of ["input", "change"]) document.getElementById(id).addEventListener(event, update);
  async function request(url, options) {
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Local helper request failed.");
    return result;
  }
  if (location.hostname === "127.0.0.1" && location.port === "8081") request("/api/target").then(result => {
    target = result;
    document.getElementById("apply-target").textContent = `Target: ${target.target}`;
    status.textContent = "Apply writes this configuration and creates a backup. Clean mode replaces all existing modules. Restart MagicMirror after applying.";
    update();
  }).catch(error => { status.textContent = error.message; });
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    busy = true; update();
    try {
      const result = await request("/api/apply", { method: "POST", headers: { "Content-Type": "application/json", "X-Setup-Apply": "1" }, body: JSON.stringify({ state: state(), version: target.version }) });
      target.version = result.version;
      status.textContent = `Configuration applied successfully. Backup created at ${result.backup}. ${result.weather || ""} Restart MagicMirror to load it.`;
    } catch (error) { status.textContent = `Configuration not applied: ${error.message}`; }
    finally { busy = false; update(); }
  });
})();
