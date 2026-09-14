/* Preview-only state and fixtures. The runtime never imports this file. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SchoolAthleticsPreview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const presets = { "1920x1080": [1920, 1080], "3840x2160": [3840, 2160], "1366x768": [1366, 768], "1920x1200": [1920, 1200] };
  function resolution(preset, width, height) {
    if (Object.hasOwn(presets, preset)) return { width: presets[preset][0], height: presets[preset][1] };
    if (preset !== "custom") throw new Error("Choose a display resolution.");
    const valid = value => (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) && Number.isInteger(Number(value)) && Number(value) >= 320 && Number(value) <= 7680;
    if (!valid(width) || !valid(height)) throw new Error("Enter whole-number dimensions from 320 to 7680 pixels.");
    return { width: Number(width), height: Number(height) };
  }
  function mockData(mode) {
    if (!["typical", "long", "maximum"].includes(mode)) throw new Error("Choose preview data.");
    const count = mode === "maximum" ? 16 : mode === "long" ? 4 : 3;
    return Object.fromEntries(["home", "away"].map(kind => [kind, Array.from({ length: count }, (_, i) => ({
      time: ["4:00 PM", "5:30 PM", "7:00 PM"][i % 3],
      team: mode === "long" ? "Girls Junior Varsity Regional Championship Volleyball Development Team" : ["Varsity Soccer", "Girls Volleyball", "JV Football"][i % 3],
      opponent: mode === "long" ? "Northern Valley International Preparatory Academy and Community School Athletics" : ["East High School", "West Academy", "North High School"][i % 3],
      kind
    }))]));
  }
  function state(values, controls) {
    const size = resolution(controls.preset, controls.width, controls.height);
    return { ...size, safeArea: controls.safeArea === true, mode: controls.mode, games: mockData(controls.mode),
      schoolName: values.schoolName || "Example High School", accentColor: /^#[a-f\d]{6}$/i.test(values.accentColor || "") ? values.accentColor : "#ffffff",
      schoolLogo: values.schoolLogo || "", backgroundImage: values.backgroundImage || "",
      displayFont: values.displayFont || "default",
      showDateTime: values.showDateTime === true, showSchoolName: values.showSchoolName === true, showWeather: values.showWeather === true };
  }
  function scale(size, availableWidth, maxHeight = 480) { return Math.max(0, Math.min(1, availableWidth / size.width, maxHeight / size.height)); }
  function overflows(measurements) {
    return measurements.some(m => m.scrollWidth > m.clientWidth + 1 || m.scrollHeight > m.clientHeight + 1 ||
      (m.bounds && m.limit && (m.bounds.left < m.limit.left - 1 || m.bounds.right > m.limit.right + 1 || m.bounds.top < m.limit.top - 1 || m.bounds.bottom > m.limit.bottom + 1)));
  }
  return { presets, resolution, mockData, state, scale, overflows };
});
