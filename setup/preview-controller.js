(function () {
  "use strict";
  const model = SchoolAthleticsPreview;
  const byId = id => document.getElementById(id);
  const frame = byId("display-frame");
  const host = byId("display-host");
  const stage = byId("display-stage");
  let ready = false;
  let revision = 0;
  let current;
  for (const key of Object.keys(model.presets)) {
    const option = document.createElement("option"); option.value = key; option.textContent = key.replace("x", " × "); byId("preview-resolution").appendChild(option);
  }
  const custom = document.createElement("option"); custom.value = "custom"; custom.textContent = "Custom"; byId("preview-resolution").appendChild(custom);
  const initial = model.resolution(byId("preview-resolution").value);
  byId("preview-width").value = initial.width;
  byId("preview-height").value = initial.height;
  function fit() {
    if (!current) return;
    const factor = model.scale(current, host.clientWidth);
    frame.style.width = `${current.width}px`;
    frame.style.height = `${current.height}px`;
    frame.style.transform = `scale(${factor})`;
    stage.style.width = `${current.width * factor}px`;
    stage.style.height = `${current.height * factor}px`;
    byId("preview-size").textContent = `${current.width} × ${current.height} logical pixels · ${Math.round(factor * 100)}% scale`;
  }
  function render() {
    revision++;
    byId("preview-images").textContent = "";
    byId("preview-status").textContent = "Checking layout…";
    byId("preview-custom").hidden = byId("preview-resolution").value !== "custom";
    const values = Object.fromEntries(["schoolName", "accentColor", "schoolLogo", "backgroundImage", "displayFont", "showDateTime", "showSchoolName", "showWeather"].map(key => [key, byId(key).type === "checkbox" ? byId(key).checked : byId(key).value]));
    try {
      current = model.state(values, { preset: byId("preview-resolution").value, width: byId("preview-width").value, height: byId("preview-height").value, safeArea: byId("preview-safe").checked, mode: byId("preview-data").value });
      byId("preview-error").hidden = true;
      host.hidden = false;
      fit();
      if (ready) frame.contentWindow.postMessage({ type: "school-preview-render", state: current, revision }, location.origin === "null" ? "*" : location.origin);
    } catch (error) {
      current = null;
      host.hidden = true;
      byId("preview-error").textContent = error.message;
      byId("preview-error").hidden = false;
      byId("preview-status").textContent = "Enter a valid resolution to check the layout.";
      byId("preview-size").textContent = "";
    }
  }
  for (const id of ["setup-form", "preview-controls"]) {
    byId(id).addEventListener("input", render);
    byId(id).addEventListener("change", render);
  }
  frame.addEventListener("load", () => { ready = true; render(); });
  window.addEventListener("message", event => {
    if (event.source !== frame.contentWindow || (location.origin !== "null" && event.origin !== location.origin) || event.data?.type !== "school-preview-measured" || event.data.revision !== revision || !current) return;
    byId("preview-status").textContent = event.data.overflow ? "⚠ Content exceeds available display area" : "✓ Layout fits this display";
    byId("preview-status").dataset.overflow = String(event.data.overflow);
    byId("preview-images").textContent = event.data.imageErrors.join(" ");
  });
  new ResizeObserver(fit).observe(host);
  frame.src = "preview.html";
  render();
})();
