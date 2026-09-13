# MMM-SchoolAthletics

Display school athletics schedules in Home and Away panes on MagicMirror², with optional opponent logos. Includes a local configuration generator and mock display preview. This project is not affiliated with or endorsed by ArbiterSports.

## Install

Requires an existing MagicMirror² installation and Node.js 22 or later, also meeting your MagicMirror² version's requirements. Python 3 is needed only for the setup-page server.

1. Place this repository in `MagicMirror/modules/MMM-SchoolAthletics` (the folder name must match).
2. In that module folder, run `npm ci`.
3. Generate a configuration below, copy it into the `modules` array in `MagicMirror/config/config.js`, then restart MagicMirror².

## Local setup

From the parent `modules` directory:

```sh
cd MMM-SchoolAthletics
python3 -m http.server 8080
```

Open [the setup page](http://localhost:8080/setup/). Stop the server with Ctrl+C when finished. Use this temporary server on a trusted local network; it serves the module directory.

Supply your **Arbiter iCal/calendar subscription URL** in the required `calendarUrl` field. This HTTPS URL supplies schedule data; an HTML school/team page is not a calendar feed. The optional `arbiterSchoolId` only assists automatic opponent-logo discovery. Schedules and manual logos work without it.

Choose your school name, accent, and timezone, optionally enter image paths, then review the preview and copy the generated configuration into MagicMirror's `config.js`. The page never writes that file, saves entries, uploads images, or contacts Arbiter/weather services. Header choices generate reminders for separate MagicMirror clock, school-name, and weather modules; they do not configure those modules.

Minimal manual configuration (replace the fake URL placeholder):

```js
{
  module: "MMM-SchoolAthletics",
  position: "middle_center",
  config: {
    calendarUrl: "https://www.arbiterlive.com/REPLACE_WITH_ICAL_URL",
    arbiterSchoolId: "", // Optional; automatic opponent-logo discovery only.
    timeZone: "America/Chicago",
    homeKeywords: ["Example Stadium"]
  }
}
```

## Schedule and logos

- **Timezone:** `timeZone` controls event-day grouping, display times, and interpretation of times without a timezone. An empty runtime value uses the display system's timezone. The generator initially selects your browser's timezone; change it to the school's IANA timezone when needed.
- **Home/Away:** title markers ` @ ` mean Away; ` vs ` or ` vs. ` mean Home. Without a marker, a case-insensitive location match against `homeKeywords` means Home. Otherwise `unknownGamePolicy` applies: `hide` (default), `home`, or `away`.
- **Refresh:** 30 minutes by default; values below 15 minutes are clamped. One calendar response supplies both panes. Failed refreshes retain the previous display.
- **Logos:** manual override, valid cached logo, optional Arbiter discovery, then fallback/no logo. Discovery requires a school ID and may not find every opponent. Set `logos.autoDiscover: false` to disable discovery or `logos.enabled: false` to hide logos.

For manual overrides, add this inside `config`:

```js
logos: {
  overrides: [{ opponent: "Example High School", image: "images/example.png" }],
  fallbackImage: "images/fallback.png"
}
```

Image paths must point to assets you have placed in the module folder; example images are not included. Setup `schoolLogo` and `backgroundImage` fields accept relative local paths such as `images/school.png`. They appear in the simulator but are not rendered by the runtime athletics panes. Runtime opponent-logo overrides additionally support `/modules/...` paths and HTTPS images. Use small, optimized images and transparent-background PNG/SVG logos where appropriate; there is no SVG processing.

Downloaded logos live in ignored `public/logos/v2/`, with metadata in `.cache/logos.json`. Successful and failed lookups expire and reuse cached work; managed images have a default 50 MiB budget. Temporary downloads may exceed that budget until cleanup. Manual images and legacy files directly under `public/logos/` are outside managed eviction.

## Display preview

Choose **1920×1080**, **3840×2160**, **1366×768**, **1920×1200**, or custom dimensions (320–7680 pixels per axis). The selected logical display scales proportionally to fit the page, with a reserved clock/name/weather band above the Home/Away panes.

**Typical**, **Long Names**, and **Maximum Games** use mock data to test wrapping and crowding. **Show safe area** adds a visual 4% inset without changing layout. A status reports obvious header overflow, pane overflow, or clipped rows. Stress modes may intentionally exceed the available area. The simulator is approximate; actual MagicMirror themes/fonts may differ. It does not test live calendars, weather, or TV physical size.

## Troubleshooting and release status

- **No schedule:** check the required HTTPS subscription URL and MagicMirror logs. A school ID alone cannot provide schedules. Events without classification are hidden by default; check title markers and home venue keywords.
- **Wrong dates/times:** verify the selected school timezone and display system clock.
- **Missing logos/images:** check local paths and filenames, supply manual overrides, and remember that automatic discovery is optional and failures are cached before retrying.
- **Setup will not load:** run the server from this module folder and open `/setup/`, rather than opening the HTML file directly. If port 8080 is busy, stop its existing server or use another port in both the command and URL.

Defaults and advanced options are documented in `shared/config.js` and `config.schema.json`. Run `npm run check` and `npm test` for local validation. Arbiter HTML changes can break logo discovery; live feed and target-device verification remain outstanding.

**Public-release blocker:** original source authorship and licensing still need verification. No project license has been granted (`UNLICENSED`); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Do not treat this repository as MIT-licensed yet. Dependency notices and logo owners' rights remain applicable.
