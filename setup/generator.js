/* Pure generation logic: no DOM, requests, storage, or config-file writes. */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("../shared/config") : root.SchoolAthleticsConfig);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined" || typeof module === "undefined") root.SchoolAthleticsSetup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  "use strict";
  function validTimeZone(value) {
    if (!value || typeof value !== "string") return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; }
    catch { return false; }
  }
  function initialState(browserZone) {
    const defaults = shared.defaults();
    return {
      schoolName: defaults.schoolName, calendarUrl: defaults.calendarUrl,
      arbiterSchoolId: defaults.arbiterSchoolId,
      timeZone: validTimeZone(browserZone) ? browserZone : (defaults.timeZone || "UTC"),
      accentColor: defaults.theme.homeAccent,
      schoolLogo: defaults.schoolLogo, backgroundImage: defaults.backgroundImage,
      // Screen choices belong to this page only, not the athletics runtime config.
      showDateTime: true, showSchoolName: true, showWeather: false
    };
  }
  function companionNotes(state) {
    return [
      state.showDateTime ? "Date/time: enable a separate clock module at top_left." : "Date/time: leave the companion clock off.",
      state.showSchoolName ? "School name: arrange a separate school-name header at top_center." : "School name: leave the companion header off.",
      state.showWeather ? "Weather: configure a separate weather module at top_right with your provider settings." : "Weather: leave the companion weather module off.",
      "These choices are reminders; this snippet does not configure companion modules."
    ];
  }
  function generate(state) {
    const errors = {};
    const text = key => typeof state[key] === "string" ? state[key].trim() : "";
    const candidate = {};
    try { candidate.calendarUrl = shared.arbiterUrl(text("calendarUrl")).href; }
    catch { errors.calendarUrl = "Enter a valid HTTPS Arbiter calendar URL."; }
    if (!validTimeZone(text("timeZone"))) errors.timeZone = "Choose a valid time zone.";
    candidate.timeZone = text("timeZone");
    candidate.theme = { homeAccent: text("accentColor") };
    if (!new RegExp(shared.schema.properties.theme.properties.homeAccent.pattern).test(candidate.theme.homeAccent)) errors.accentColor = "Choose a six-digit hex color.";
    for (const key of ["schoolLogo", "backgroundImage"]) {
      try { const value = shared.relativeImagePath(text(key)); if (value) candidate[key] = value; }
      catch { errors[key] = "Use a relative image path, such as images/school-logo.png."; }
    }
    for (const key of ["schoolName", "arbiterSchoolId"]) if (text(key)) candidate[key] = text(key);
    // Let the runtime validator enforce the full definition, including numeric ID and bounds.
    if (!Object.keys(errors).length) {
      try { shared.normalize(candidate); }
      catch (error) {
        const field = Object.keys(shared.schema.properties).find(key => error.message.includes(key));
        errors[field || "form"] = field === "arbiterSchoolId" ? "Enter the numeric school ID, or leave it blank." : "Check this value; it is too long or has an invalid format.";
      }
    }
    const notes = companionNotes(state);
    if (candidate.schoolLogo || candidate.backgroundImage) notes.push("Image paths are reserved for a future screen layout; the athletics panes do not display these images yet.");
    if (Object.keys(errors).length) return { errors, notes, output: "", entry: null };
    const entry = { module: "MMM-SchoolAthletics", position: "middle_center", config: candidate };
    const output = notes.map(note => `// ${note}`).join("\n") + "\n" + JSON.stringify(entry, null, 2);
    return { errors, notes, output, entry };
  }
  return { initialState, validTimeZone, companionNotes, generate };
});
