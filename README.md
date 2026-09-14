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
node setup/server.js
```

Open [the setup page](http://127.0.0.1:8081/setup/). Stop the helper with Ctrl+C when finished. The helper listens on loopback and provides the full setup workflow without conflicting with MagicMirror's default port 8080.

Supply your **Arbiter iCal/calendar subscription URL** in the required `calendarUrl` field. This HTTPS URL supplies schedule data; an HTML school/team page is not a calendar feed. The optional `arbiterSchoolId` only assists automatic opponent-logo discovery. Schedules and manual logos work without it.

Choose your school name, accent, and timezone, optionally enter image paths, then review the preview and copy the generated configuration into MagicMirror's `config.js`. The runtime shows `schoolName` centered above the athletics panes, and uses `backgroundImage` as a module-relative, full-board background. The static page never writes that file, saves entries, uploads images, or contacts Arbiter/weather services. The optional local helper below can apply configuration after an explicit click.

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

## Optional Apply to MagicMirror

From this module folder, run `node setup/server.js` and open `http://127.0.0.1:8081/setup/`. The helper detects `../../config/config.js` when installed under MagicMirror's `modules` folder. Only if detection is unavailable, use `node setup/server.js --config /absolute/path/to/config.js`. The target must already exist; the page displays it before enabling **Apply to MagicMirror**.

Generate valid settings, review the output mode and target, then click Apply. Module-only mode adds or replaces the athletics entry while retaining unrelated modules. Clean mode replaces the entire modules array with a top-left clock, one safely identifiable existing current-weather widget at top-right when available, and athletics in middle-center. Forecasts and unrelated widgets are removed. Clean mode keeps clock/current weather independently of the preview toggles. Weather preservation requires Apply; copied output cannot inspect existing settings. A timestamped backup is created beside the target before an atomic replacement. Restart MagicMirror yourself afterward. Stop the helper with Ctrl+C when done. Copy configuration remains available, including with the Python server.

The helper listens only on IPv4 loopback and accepts same-origin writes. It uses Acorn to parse configuration without executing it. It supports a literal `var`/`let`/`const config` object with one literal `modules` array; dynamic configurations, symlink targets, and multiple existing athletics entries in module-only mode require manual editing. It checks for changes since the page loaded; reload after an external edit. Backups are retained for manual recovery and are not automatically deleted. When started from a standalone checkout with `--config`, uploads are redirected to the installed `MagicMirror/modules/MMM-SchoolAthletics/images/uploads/` folder only when that target clearly identifies an installed MagicMirror module. Weather recognition requires a literal built-in `weather` entry with `config.type: "current"`, an explicit provider, and an explicit location/locationID or lat/lon. Disabled or ambiguous dynamic entries are skipped; the first eligible top-right widget is preferred, otherwise the first eligible widget is moved there. Provider/location/config source is preserved, but provider credentials and live operation are not verified.

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

Image paths must point to locally available module assets. You can still enter paths manually. With `node setup/server.js`, choose PNG, JPEG, or WebP files directly in setup (8 MiB maximum, 24 megapixels, non-animated). Images are validated and copied only into this module’s `images/uploads/`; nothing is sent to an external service. Saved paths immediately update configuration and preview. Duplicate names receive a numeric suffix. Uploaded files are ignored by Git and retained until you remove them manually. The optional bundled templates are **Use mountain sample** (`images/sample-background.png`) and **Use dragon sample** (`images/sample-dragon-background.png`, red/black/gray). Both are generic, with no school name, and work offline in helper and static/Python setup. Neither is selected by default; clicking a sample updates configuration and preview. Static/Python uploads remain manual-path/copy-only. Setup `backgroundImage` paths such as `images/background.png` render behind the runtime display, while `schoolLogo` appears beside Home Games. Display Font changes normal board text while preserving icon-specific fonts. Runtime opponent-logo overrides additionally support `/modules/...` paths and HTTPS images. Use small, optimized images and transparent-background PNG/SVG logos where appropriate; there is no SVG processing.

Downloaded logos live in ignored `public/logos/v2/`, with metadata in `.cache/logos.json`. Successful and failed lookups expire and reuse cached work; managed images have a default 50 MiB budget. Temporary downloads may exceed that budget until cleanup. Manual images and legacy files directly under `public/logos/` are outside managed eviction.

## Display preview

Choose **1920×1080**, **3840×2160**, **1366×768**, **1920×1200**, or custom dimensions (320–7680 pixels per axis). The selected logical display scales proportionally to fit the page, with a reserved clock/name/weather band above the Home/Away panes.

**Typical**, **Long Names**, and **Maximum Games** use mock data to test wrapping and crowding. **Show safe area** adds a visual 4% inset without changing layout. A status reports obvious header overflow, pane overflow, or clipped rows. Stress modes may intentionally exceed the available area. The simulator is approximate; actual MagicMirror themes/fonts may differ. It does not test live calendars, weather, or TV physical size.

## Troubleshooting

- **No schedule:** check the required HTTPS subscription URL and MagicMirror logs. A school ID alone cannot provide schedules. Events without classification are hidden by default; check title markers and home venue keywords.
- **Wrong dates/times:** verify the selected school timezone and display system clock.
- **Missing logos/images:** check local paths and filenames, supply manual overrides, and remember that automatic discovery is optional and failures are cached before retrying.
- **Setup will not load:** run the server from this module folder and open `/setup/`, rather than opening the HTML file directly. If port 8080 is busy, stop its existing server or use another port in both the command and URL.

Defaults and advanced options are documented in `shared/config.js` and `config.schema.json`. Run `npm run check` and `npm test` for local validation. Arbiter HTML changes can break logo discovery; live feed and target-device verification remain outstanding.

## License

MMM-SchoolAthletics source code is released under the [MIT License](LICENSE).

Third-party libraries retain their respective licenses. School logos,
trademarks, the PingState brand, and other third-party or branding assets are
not licensed under the MIT License. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.
