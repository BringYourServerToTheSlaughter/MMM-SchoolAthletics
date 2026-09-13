/* Available middle-region bounds; no schedule or school-specific state. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SchoolAthleticsLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function bounds(body, viewportHeight, topRegions, bottomRegions, gap) {
    const safe = viewportHeight * 0.04;
    const top = Math.max(body.top, safe, ...topRegions.map(r => r.bottom + gap));
    const bottom = Math.min(body.bottom, viewportHeight - safe, ...bottomRegions.map(r => r.top - gap));
    return { top: top - body.top, height: Math.max(0, bottom - top) };
  }
  return { bounds };
});
