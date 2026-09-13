# MMM-SchoolAthletics

MagicMirror² athletics schedules in two Home/Away panes. Stage 2A core; no setup UI, header/weather modules, or screen-preview tool.

Install this directory under `MagicMirror/modules/MMM-SchoolAthletics`, use Node.js 22 or later (also meeting your MagicMirror version's requirements), and run `npm ci` here. Configure through MagicMirror's `config.js`:

```js
{
  module: "MMM-SchoolAthletics",
  position: "middle_center",
  config: {
    calendarUrl: "https://www.arbiterlive.com/REPLACE_WITH_ICAL_URL",
    arbiterSchoolId: "", // Supply the school's numeric ID for automatic logos.
    schoolName: "",
    homeKeywords: [],
    timeZone: "", // Empty uses the display system timezone.
    locale: "en-US",
    timeFormat: "12h",
    refreshInterval: 30 * 60 * 1000,
    unknownGamePolicy: "hide", // hide | home | away
    upcomingCount: 4, // 0 hides upcoming games.
    showCancelled: true,
    showLastUpdated: false,
    layout: "auto",
    theme: { homeAccent: "#ffffff", awayAccent: "#bdbdbd" },
    logos: {
      enabled: true,
      autoDiscover: true,
      fallbackImage: "",
      overrides: [], // e.g. { opponent: "Example High School", image: "logos/example.png" }
      cache: { maxAge: 2592000000, negativeMaxAge: 86400000, maxBytes: 52428800 }
    }
  }
}
```

Use an actual HTTPS Arbiter ICS subscription URL, not an HTML school/team page. Missing school ID skips automatic discovery; manual logos and schedules still work. `schoolName` is optional metadata for future tools, not an additional header. The existing `lookAheadDays` setting defaults to 90. Types, defaults, and bounds are in `shared/config.js` and the generated `config.schema.json`.

` @ ` means Away; ` vs ` and ` vs. ` mean Home. Without a marker, a matching home-location keyword means Home; other events follow `unknownGamePolicy`. Refresh intervals below 15 minutes are clamped. One calendar response supplies both panes, and failures preserve the previous display. Resume requests a fresh check; logos arrive separately. Network requests retain the existing HTTPS/DNS guards, response bounds, shared caching, and failure backoff.

Logo priority: manual override, valid local cache, optional discovery, fallback/no logo. Relative image paths resolve within this module; `/modules/...` paths and HTTPS image URLs also work. Use small, optimized images. Transparent-background PNG is recommended for logos. There is no SVG processing.

Automatic cache files are in `public/logos/v2/`, with metadata in `.cache/logos.json`. Positive and negative entries expire, repeated lookups reuse work, invalid files are removed, and managed images are evicted to meet the shared byte budget. Legacy files directly under `public/logos/` are not imported or removed. The smallest configured budget applies until helper restart; temporary downloads can exceed the budget until cleanup. Manual images are outside this cache.

Run `npm run check` and `npm test` for local validation. The current node-ical parser and Arbiter HTML discovery approach are retained. Live feed/target-device verification and source provenance/license review remain necessary before release. See `THIRD_PARTY_NOTICES.md`; no project license has been selected.
