(function () {
  "use strict";
  let revision = 0;
  let current;
  const images = {};
  const byId = id => document.getElementById(id);
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  function measure() {
    if (!current) return;
    const measurements = [];
    for (const selector of [".header-slot", ".pane", ".games"]) for (const el of document.querySelectorAll(selector)) measurements.push({ clientWidth: el.clientWidth, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight });
    for (const row of document.querySelectorAll(".game")) measurements.push({ bounds: box(row), limit: box(row.parentElement) });
    for (const el of document.querySelectorAll(".pane h2, .pane .date")) measurements.push({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, bounds: box(el), limit: box(el.parentElement) });
    parent.postMessage({ type: "school-preview-measured", revision, overflow: SchoolAthleticsPreview.overflows(measurements), imageErrors: Object.values(images).filter(Boolean) }, location.origin === "null" ? "*" : location.origin);
  }
  function image(id, value) {
    const el = byId(id);
    delete images[id];
    el.hidden = true;
    el.removeAttribute("src");
    if (!value) return;
    try {
      const path = SchoolAthleticsConfig.relativeImagePath(value);
      if (!path) return;
      const url = new URL(`../${path}`, location.href);
      const requestRevision = revision;
      el.onload = () => { if (requestRevision === revision) { el.hidden = false; measure(); } };
      el.onerror = () => { if (requestRevision === revision) { el.hidden = true; images[id] = `${id === "background" ? "Background image" : "School logo"} could not be loaded locally.`; measure(); } };
      el.src = url.href;
    } catch { images[id] = "Use valid relative image paths for the preview."; }
  }
  window.addEventListener("message", event => {
    if (event.source !== parent || (location.origin !== "null" && event.origin !== location.origin) || event.data?.type !== "school-preview-render") return;
    current = event.data.state;
    revision = event.data.revision;
    document.documentElement.style.setProperty("--accent", current.accentColor);
    byId("clock").hidden = !current.showDateTime;
    byId("school").hidden = !current.showSchoolName;
    byId("weather").hidden = !current.showWeather;
    byId("school-name").textContent = current.schoolName;
    byId("safe-area").hidden = !current.safeArea;
    image("background", current.backgroundImage);
    image("school-logo", current.showSchoolName ? current.schoolLogo : "");
    for (const kind of ["home", "away"]) {
      const list = byId(`${kind}-games`);
      list.className = `games ${current.mode}`;
      list.replaceChildren(...current.games[kind].map(game => {
        const row = document.createElement("article"); row.className = "game";
        const time = document.createElement("div"); time.className = "time"; time.textContent = game.time;
        const details = document.createElement("div"); details.className = "details";
        const team = document.createElement("div"); team.className = "team"; team.textContent = game.team;
        const opponent = document.createElement("div"); opponent.className = "opponent"; opponent.textContent = `${kind === "away" ? "at" : "vs"} ${game.opponent}`;
        details.append(team, opponent); row.append(time, details); return row;
      }));
    }
    requestAnimationFrame(measure);
  });
  window.addEventListener("resize", () => requestAnimationFrame(measure));
})();
