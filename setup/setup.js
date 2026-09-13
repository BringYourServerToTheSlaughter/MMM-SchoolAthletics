/* Local-only form controller. Image paths are text; they are never loaded here. */
(function () {
  "use strict";
  const model = SchoolAthleticsSetup;
  const form = document.getElementById("setup-form");
  const output = document.getElementById("generated-config");
  const copy = document.getElementById("copy-config");
  const status = document.getElementById("copy-status");
  const notes = document.getElementById("companion-notes");
  const state = model.initialState(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  const fields = Object.keys(state);
  const touched = new Set();
  const zoneSelect = document.getElementById("timeZone");
  let zones;
  try { zones = Intl.supportedValuesOf("timeZone"); }
  catch { zones = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"]; }
  for (const zone of [...new Set(["UTC", state.timeZone, ...zones])].filter(model.validTimeZone).sort()) {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = zone.replaceAll("_", " ");
    zoneSelect.appendChild(option);
  }
  for (const key of fields) {
    const control = document.getElementById(key);
    if (typeof state[key] === "boolean") control.checked = state[key];
    else control.value = state[key];
    const property = SchoolAthleticsConfig.schema.properties[key];
    if (property?.type === "string" && control.tagName === "INPUT") control.maxLength = property.maxLength || 2048;
  }
  let result;
  let revision = 0;
  function render() {
    revision++;
    status.textContent = "";
    for (const key of fields) {
      const control = document.getElementById(key);
      state[key] = control.type === "checkbox" ? control.checked : control.value;
    }
    result = model.generate(state);
    document.getElementById("output-help").textContent = state.outputMode === "clean"
      ? "Replace the entire existing modules: [...] section in MagicMirror's config.js with this output. Do not append it or replace the whole file. Keep commas between config properties."
      : "Copy this entry into the modules array in MagicMirror's config.js. Add a comma between neighboring entries.";
    document.getElementById("accentColor-value").textContent = state.accentColor.toUpperCase();
    for (const key of [...fields, "form"]) {
      const error = document.getElementById(`${key}-error`);
      if (!error) continue;
      const message = result.errors[key] || "";
      const show = Boolean(message && (touched.has(key) || key === "form"));
      error.textContent = show ? message : "";
      error.hidden = !show;
      const control = document.getElementById(key);
      if (control) control.setAttribute("aria-invalid", String(show));
    }
    output.value = result.output;
    copy.disabled = !result.output;
    notes.replaceChildren(...result.notes.map(text => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }));
  }
  form.addEventListener("submit", event => event.preventDefault());
  document.getElementById("outputMode").addEventListener("change", render);
  form.addEventListener("input", event => { touched.add(event.target.id); render(); });
  form.addEventListener("change", event => { touched.add(event.target.id); render(); });
  form.addEventListener("focusout", event => { touched.add(event.target.id); render(); });
  copy.addEventListener("click", async () => {
    if (!result.output) return;
    const text = result.output;
    const copiedRevision = revision;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (revision === copiedRevision) status.textContent = "Copied";
    } catch {
      if (revision !== copiedRevision) return;
      output.focus();
      output.select();
      status.textContent = "Select and copy the highlighted text with Ctrl+C or ⌘C.";
    }
  });
  render();
})();
