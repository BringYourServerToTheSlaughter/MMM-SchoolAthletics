/* Shared by the MagicMirror browser module and Node helper. Keep options JSON-safe. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined" || typeof module === "undefined") root.SchoolAthleticsConfig = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Use small, optimized images. Transparent-background PNG is recommended for logos.
  const imageHelp = "Use small, optimized images. Transparent-background PNG is recommended for logos. Use a module-relative path, a trusted /modules/... path, or an HTTPS URL.";
  const displayFonts = Object.freeze({
    default: "",
    arial: "Arial, sans-serif",
    verdana: "Verdana, sans-serif",
    trebuchet: "Trebuchet MS, sans-serif",
    georgia: "Georgia, serif",
    montserrat: '"MMM Montserrat", sans-serif',
    oswald: '"MMM Oswald", sans-serif',
    robotoSlab: '"MMM Roboto Slab", serif',
    merriweather: '"MMM Merriweather", serif',
    bebasNeue: '"MMM Bebas Neue", sans-serif'
  });
  const string = (defaultValue, description, extra = {}) => ({ type: "string", default: defaultValue, description, ...extra });
  const integer = (value, minimum, maximum, description) => ({ type: "integer", default: value, minimum, maximum, description });
  const bool = (value, description) => ({ type: "boolean", default: value, description });
  const object = properties => ({ type: "object", additionalProperties: false, properties });
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MMM-SchoolAthletics configuration",
    ...object({
      calendarUrl: string("", "Arbiter HTTPS iCalendar subscription URL. Required.", { format: "uri" }),
      arbiterSchoolId: string("", "Numeric school ID from /School/<id>. If omitted, automatic logo discovery is skipped."),
      schoolName: string("", "Optional school name shown above the athletics panes."),
      schoolLogo: string("", "Optional module-relative school logo shown beside the Home Games heading."),
      backgroundImage: string("", "Optional module-relative background image shown behind the athletics display."),
      displayFont: string("default", "Display font for normal text across the MagicMirror board.", { enum: Object.keys(displayFonts) }),
      timeZone: string("", "School IANA timezone. Empty uses the display system timezone; also interprets floating event times."),
      locale: string("en-US", "Locale for dates and times. Interface labels are currently English."),
      timeFormat: string("12h", "Time display format.", { enum: ["12h", "24h"] }),
      refreshInterval: integer(1800000, 900000, 86400000, "Calendar refresh interval in milliseconds; values below 15 minutes are clamped to 15 minutes."),
      upcomingCount: integer(4, 0, 50, "Upcoming games per category; zero hides upcoming games."),
      lookAheadDays: integer(90, 1, 366, "Number of calendar days to search for upcoming games."),
      homeKeywords: { type: "array", default: [], maxItems: 100, description: "Home venue names/aliases used when the title has no home/away marker.", items: { type: "string", minLength: 1, maxLength: 200 } },
      unknownGamePolicy: string("hide", "How to handle games without a recognized title marker or home venue.", { enum: ["hide", "home", "away"] }),
      showCancelled: bool(true, "Display cancelled games with a cancellation label."),
      showLastUpdated: bool(false, "Show the time the calendar was last successfully checked."),
      layout: string("auto", "Automatically fit panes, force columns, or stack vertically.", { enum: ["auto", "columns", "stacked"] }),
      theme: object({
        homeAccent: string("#ffffff", "Home pane accent color.", { pattern: "^#[0-9a-fA-F]{6}$" }),
        awayAccent: string("#bdbdbd", "Away pane accent color.", { pattern: "^#[0-9a-fA-F]{6}$" })
      }),
      logos: object({
        enabled: bool(true, "Show opponent logos for today's games."),
        autoDiscover: bool(true, "Discover opponent logos on Arbiter when arbiterSchoolId is supplied."),
        fallbackImage: string("", imageHelp),
        overrides: { type: "array", default: [], maxItems: 200, description: "Manual opponent logos take priority over automatic discovery.", items: { ...object({ opponent: { type: "string", minLength: 1, maxLength: 200 }, image: { type: "string", minLength: 1, maxLength: 2048, description: imageHelp } }), required: ["opponent", "image"] } },
        cache: object({
          maxAge: integer(2592000000, 3600000, 31536000000, "Successful logo cache lifetime in milliseconds."),
          negativeMaxAge: integer(86400000, 60000, 604800000, "Retry delay for missing or failed logos, in milliseconds."),
          maxBytes: integer(52428800, 1048576, 209715200, "Shared automatic-logo cache budget in bytes. The smallest active instance budget wins.")
        })
      })
    })
  };
  function defaults(node = schema) {
    if (node.type === "object") return Object.fromEntries(Object.entries(node.properties).map(([key, child]) => [key, defaults(child)]));
    return node.default === undefined ? undefined : JSON.parse(JSON.stringify(node.default));
  }
  function validate(node, value, at = "config") {
    if (value === undefined) value = defaults(node);
    if (node.type === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object.`);
      const out = {};
      // MagicMirror adds framework options to config; ignore these only at the root.
      for (const key of Object.keys(value)) if (at !== "config" && !Object.hasOwn(node.properties, key)) throw new Error(`Unknown option ${at}.${key}.`);
      for (const key of node.required || []) if (value[key] === undefined) throw new Error(`${at}.${key} is required.`);
      for (const [key, child] of Object.entries(node.properties)) out[key] = validate(child, value[key], `${at}.${key}`);
      return out;
    }
    if (node.type === "array") {
      if (!Array.isArray(value) || value.length > node.maxItems) throw new Error(`${at} must be an array with at most ${node.maxItems} entries.`);
      return value.map((item, index) => validate(node.items, item, `${at}[${index}]`));
    }
    if (node.type === "integer") {
      if (!Number.isSafeInteger(value) || value < node.minimum || value > node.maximum) throw new Error(`${at} must be an integer from ${node.minimum} to ${node.maximum}.`);
    } else if (typeof value !== node.type) throw new Error(`${at} must be a ${node.type}.`);
    if (typeof value === "string") {
      value = value.trim();
      if (value.length < (node.minLength || 0) || value.length > (node.maxLength || 2048)) throw new Error(`${at} has an invalid length.`);
      if (node.pattern && !new RegExp(node.pattern).test(value)) throw new Error(`${at} has an invalid format.`);
    }
    if (node.enum && !node.enum.includes(value)) throw new Error(`${at} must be one of ${node.enum.join(", ")}.`);
    return value;
  }
  function arbiterUrl(value) {
    let url;
    try { url = new URL(value); } catch { throw new Error("calendarUrl must be an Arbiter HTTPS calendar URL."); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
        !["arbiterlive.com", "arbitersports.com"].some(domain => host === domain || host.endsWith(`.${domain}`))) {
      throw new Error("calendarUrl must use an Arbiter HTTPS host without credentials or a custom port.");
    }
    return url;
  }
  function relativeImagePath(value) {
    if (typeof value !== "string") throw new Error("Use a relative image path, such as images/school-logo.png.");
    value = value.trim();
    if (!value) return "";
    if (value.length > 2048 || !/^[A-Za-z0-9_-][A-Za-z0-9_./ -]*$/.test(value) ||
        value.split("/").some(part => !part || part === "." || part === "..") || !/\.(png|jpe?g|webp|gif|svg)$/i.test(value)) {
      throw new Error("Use a relative image path, such as images/school-logo.png.");
    }
    return value;
  }
  function imageUrl(value) {
    if (!value) return "";
    if (/^[A-Za-z0-9_-][A-Za-z0-9_./ -]*$/.test(value) && !value.includes("..")) value = `/modules/MMM-SchoolAthletics/${value}`;
    if (/^\/modules\/[A-Za-z0-9_./% -]+$/.test(value) && !value.includes("..") && !/%(?:2e|2f|5c)/i.test(value)) return value;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password) return url.href;
    } catch { /* Return a consistent field error below. */ }
    throw new Error("Logo images must use a module-relative path, a trusted /modules/... path, or an HTTPS URL.");
  }
  function normalize(input) {
    const values = { ...(input || {}) };
    if (Number.isSafeInteger(values.refreshInterval)) values.refreshInterval = Math.max(900000, values.refreshInterval);
    const config = validate(schema, values);
    if (!config.timeZone) config.timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    config.calendarUrl = arbiterUrl(config.calendarUrl).href;
    try { new Intl.DateTimeFormat(config.locale, { timeZone: config.timeZone }).format(); }
    catch { throw new Error("locale or timeZone is invalid; use a valid locale and IANA timezone."); }
    if (config.arbiterSchoolId && !/^\d{1,20}$/.test(config.arbiterSchoolId)) throw new Error("arbiterSchoolId must be a numeric string.");
    config.schoolLogo = relativeImagePath(config.schoolLogo);
    config.backgroundImage = relativeImagePath(config.backgroundImage);
    config.logos.fallbackImage = imageUrl(config.logos.fallbackImage);
    config.logos.overrides = config.logos.overrides.map(entry => ({ ...entry, image: imageUrl(entry.image) }));
    return config;
  }
  function displayFontFamily(value) { return displayFonts[value] || displayFonts.default; }
  return { schema, defaults, normalize, arbiterUrl, imageUrl, relativeImagePath, displayFonts, displayFontFamily };
});
