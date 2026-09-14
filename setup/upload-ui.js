/* Uploads fill existing fields only; their input events refresh generator and preview. */
(function () {
  "use strict";
  let available = false;
  const limit = 8 * 1024 * 1024;
  const fields = ["schoolLogo", "backgroundImage"];
  const byId = id => document.getElementById(id);
  const filename = value => value.split(/[\\/]/).pop();
  for (const [id, label] of [["sample-background", "Mountain"], ["sample-dragon-background", "Dragon"]]) {
    byId(id).addEventListener("click", () => {
      byId("backgroundImage").value = `images/${id}.png`;
      byId("backgroundImage").dispatchEvent(new Event("input", { bubbles: true }));
      byId("backgroundImage-upload-status").textContent = `${label} sample background selected. Configuration and preview updated.`;
    });
  }
  async function request(url, options) {
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Image upload failed.");
    return result;
  }
  // Static/Python mode cannot enable uploads or initiate a file write.
  if (location.hostname === "127.0.0.1" && location.port === "8081") request("/api/uploads").then(result => {
    if (result.uploads !== true) return;
    available = true;
    for (const field of fields) {
      const input = byId(field);
      input.hidden = true;
      byId(`${field}-label`).htmlFor = `${field}-upload`;
      byId(`${field}-upload-label`).hidden = true;
      byId(`${field}-upload`).disabled = false;
      byId(`${field}-upload-status`).textContent = input.value
        ? `Current image: ${filename(input.value)}`
        : "PNG, JPEG, WebP · up to 8 MiB. Copied only into this local module.";
    }
  }).catch(() => {});
  for (const field of fields) {
    const picker = byId(`${field}-upload`), input = byId(field), status = byId(`${field}-upload-status`);
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!available || !file || picker.disabled) return;
      const previous = input.value;
      picker.disabled = true;
      try {
        if (file.size > limit || !/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error("Choose PNG, JPEG, or WebP up to 8 MiB.");
        status.textContent = "Saving image locally…";
        const extension = file.name.split(".").pop().toLowerCase();
        const type = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
        const result = await request("/api/upload", { method: "POST", headers: { "Content-Type": type, "X-Setup-Upload": "1", "X-Image-Name": encodeURIComponent(file.name) }, body: file });
        const saved = SchoolAthleticsConfig.relativeImagePath(result.path);
        if (!saved.startsWith("images/uploads/")) throw new Error("Helper returned an invalid image path.");
        if (input.value !== previous) { status.textContent = `Saved ${filename(saved)}; your newer image selection was kept.`; return; }
        input.value = saved;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        status.textContent = `${file.name} saved. Configuration and preview updated.`;
      } catch (error) { status.textContent = `${error.message} Previous image path kept.`; }
      finally { picker.disabled = false; picker.value = ""; }
    });
  }
})();
