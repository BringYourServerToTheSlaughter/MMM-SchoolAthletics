/* Explicit browser location lookup only; no network requests or storage. */
(function () {
  "use strict";
  const lat = document.getElementById("latitude"), lon = document.getElementById("longitude");
  const button = document.getElementById("use-location"), status = document.getElementById("location-status");
  let revision = 0;
  function manual() {
    revision++;
    status.textContent = SchoolAthleticsSetup.coordinates({latitude:lat.value, longitude:lon.value})
      ? "Coordinates ready for Clean Apply if no current-weather widget can be preserved."
      : "Enter latitude (-90 to 90) and longitude (-180 to 180). Invalid or blank coordinates are omitted; athletics is still available.";
  }
  lat.addEventListener("input", manual); lon.addEventListener("input", manual);
  button.addEventListener("click", () => {
    if (button.disabled) return;
    if (!navigator.geolocation) { status.textContent = "Browser location is unavailable. Enter coordinates manually."; return; }
    const request = ++revision;
    button.disabled = true;
    status.textContent = "Waiting for browser location permission…";
    const failure = error => {
      button.disabled = false;
      if (request !== revision) return;
      status.textContent = error?.code === 1 ? "Location permission denied. Enter coordinates manually." : "Unable to get location. Enter coordinates manually.";
    };
    try {
      navigator.geolocation.getCurrentPosition(position => {
        button.disabled = false;
        if (request !== revision) return;
        const coordinates = SchoolAthleticsSetup.coordinates({latitude:position.coords.latitude, longitude:position.coords.longitude});
        if (!coordinates) { failure(); return; }
        lat.value = String(coordinates.lat); lon.value = String(coordinates.lon);
        lat.dispatchEvent(new Event("input", {bubbles:true}));
        lon.dispatchEvent(new Event("input", {bubbles:true}));
        status.textContent = "Location filled in. Review the coordinates before applying.";
      }, failure, {enableHighAccuracy:false, timeout:10000, maximumAge:0});
    } catch (error) { failure(error); }
  });
})();
