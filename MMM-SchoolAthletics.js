Module.register("MMM-SchoolAthletics", {
	defaults: {},

	getScripts() { return [this.file("shared/config.js"), this.file("shared/layout.js")]; },
	getStyles() { return ["MMM-SchoolAthletics.css"]; },

	start() {
		this.domReady = false;
		this.loading = true;
		this.error = null;
		this.requestId = 0;
		this.suspended = false;
		if (this.config?.calendarUrl == null || (typeof this.config.calendarUrl === "string" && !this.config.calendarUrl.trim())) {
			this.config = SchoolAthleticsConfig.defaults();
			this.loading = false;
			this.invalidConfig = true;
			this.setupRequired = true;
			this.schedule = null;
			return;
		}
		try { this.config = SchoolAthleticsConfig.normalize(this.config); }
		catch (error) { this.loading = false; this.error = error.message; this.invalidConfig = true; return; }
		this.fetchEvents();
		this.startTimers();
	},

	notificationReceived(notification) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.domReady = true;
			this.observeLayout();
			this.updateDom(0);
			return;
		}

		if (notification === "SCENES_CHANGED") {
			const module = document.getElementById(this.identifier);
			if (!module) return;

			const hidden = module.classList.contains("hidden");

			if (hidden && !this.suspended) {
				this.suspend();
			} else if (!hidden && this.suspended) {
				this.resume();
			}
		}
	},

	observeLayout() {
		if (this.layoutObserver || typeof document.getElementById !== "function") return;
		const module = document.getElementById(this.identifier);
		const region = module?.closest(".region.middle.center");
		if (!region) return;
		const update = () => {
			const modules = region.querySelectorAll(".module");
			const alone = modules.length === 1 && modules[0] === module;
			region.classList.toggle("school-athletics-region", alone);
			if (!alone) return;
			const visibleBounds = selector => Array.from(document.querySelectorAll(selector)).filter(el => el.getClientRects().length && el.getBoundingClientRect().height > 0).map(el => el.getBoundingClientRect());
			const area = SchoolAthleticsLayout.bounds(document.body.getBoundingClientRect(), window.innerHeight,
				visibleBounds(".region.top"), visibleBounds(".region.bottom"), Math.min(32, Math.max(18, window.innerWidth * .016)));
			region.style.setProperty("--athletics-region-top", `${area.top}px`);
			region.style.setProperty("--athletics-region-height", `${area.height}px`);
		};
		this.layoutObserver = new ResizeObserver(update);
		for (const el of [document.body, ...document.querySelectorAll(".region.top, .region.bottom")]) this.layoutObserver.observe(el);
		window.addEventListener("resize", update);
		update();
	},

	startTimers() {
		this.timer = setInterval(() => this.fetchEvents(), this.config.refreshInterval);
		// Re-group at the school's midnight even with a long network refresh interval.
		this.dayTimer = setInterval(() => {
			if (this.requestedDate !== this.todayKey()) this.fetchEvents();
		}, 60000);
	},

	suspend() {
		this.suspended = true;
		this.restoreBoardBackground();
		this.restoreBoardFont();
		clearInterval(this.timer);
		clearInterval(this.dayTimer);
		clearTimeout(this.watchdog);
		this.timer = null;
		this.pending = false;
		this.requestId++; // Ignore responses from before suspension.
	},

	resume() {
		if (this.invalidConfig) return;
		this.suspended = false;
		if (!this.timer) { this.fetchEvents(true); this.startTimers(); }
	},

	fetchEvents(force = false) {
		if (this.pending || this.suspended || this.invalidConfig) return;
		this.pending = true;
		this.requestedDate = this.todayKey();
		const requestId = ++this.requestId;
		this.sendSocketNotification("SCHOOL_ATHLETICS_FETCH_EVENTS", {
			instanceId: this.identifier, requestId, config: this.config, force
		});
		this.watchdog = setTimeout(() => {
			if (requestId !== this.requestId) return;
			this.pending = false;
			this.loading = false;
			this.error = "Calendar request timed out. Retrying on the next refresh.";
			if (this.domReady) this.updateDom(0);
		}, 45000);
	},

	socketNotificationReceived(notification, payload) {
		if (this.invalidConfig || !payload || payload.instanceId !== this.identifier || payload.requestId !== this.requestId || this.suspended) return;
		if (notification === "SCHOOL_ATHLETICS_EVENTS" || notification === "SCHOOL_ATHLETICS_EVENTS_ERROR") {
			clearTimeout(this.watchdog);
			this.pending = false;
			this.loading = false;
			if (notification === "SCHOOL_ATHLETICS_EVENTS") {
				this.error = null;
				// Preserve matching logos while the fresh request is enriched.
				const previous = new Map(this.schedule ? ["home", "away"].flatMap(kind => this.schedule[kind].today).map(game => [`${game.id}:${game.opponent || ""}`, game.logoUrl]) : []);
				this.schedule = payload.data;
				for (const kind of ["home", "away"]) for (const game of this.schedule[kind].today) game.logoUrl = previous.get(`${game.id}:${game.opponent || ""}`);
				this.lastUpdated = payload.lastUpdated;
			} else this.error = payload.message || "Unable to load the athletics calendar.";
		} else if (notification === "SCHOOL_ATHLETICS_LOGOS" && this.schedule) {
			for (const kind of ["home", "away"]) for (const game of this.schedule[kind].today) game.logoUrl = payload.logos[game.id] || null;
		} else return;
		if (this.domReady) this.updateDom(300);
	},

	todayKey() {
		const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: this.config.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(part => [part.type, part.value]));
		return `${parts.year}-${parts.month}-${parts.day}`;
	},

	getDom() {
		this.setBoardBackground();
		this.setBoardFont();
		const wrapper = document.createElement("div");
		wrapper.className = `school-athletics-wrapper layout-${this.config.layout || "auto"}`;
		if (this.setupRequired) {
			const setup = this.message("", "setup");
			for (const text of ["School Athletics", "Setup required"]) {
				const line = document.createElement("div");
				line.textContent = text;
				setup.appendChild(line);
			}
			wrapper.appendChild(setup);
			return wrapper;
		}
		if (this.config.theme) {
			wrapper.style.setProperty("--school-home-accent", this.config.theme.homeAccent);
			wrapper.style.setProperty("--school-away-accent", this.config.theme.awayAccent);
		}
		if (this.config.schoolName) {
			wrapper.className += " has-school-name";
			const schoolName = document.createElement("div");
			schoolName.className = "school-athletics-school-name";
			schoolName.textContent = this.config.schoolName;
			wrapper.appendChild(schoolName);
		}

		if (this.loading) {
			wrapper.appendChild(this.message("Loading today’s games…", "loading"));
			return wrapper;
		}

		if (this.error) {
			wrapper.appendChild(this.message(this.schedule ? `Showing saved schedule. ${this.error}` : this.error, "error"));
			if (!this.schedule) return wrapper;
		}

		wrapper.appendChild(this.buildPane("home", "HOME GAMES", this.schedule.home));
		wrapper.appendChild(this.buildPane("away", "AWAY GAMES", this.schedule.away));
		return wrapper;
	},

	setBoardBackground() {
		if (!document.body?.style) return;
		if (!this.config.backgroundImage) return this.restoreBoardBackground();
		if (!this.boardBackground) {
			this.boardBackground = {
				image: document.body.style.backgroundImage,
				size: document.body.style.backgroundSize,
				position: document.body.style.backgroundPosition,
				repeat: document.body.style.backgroundRepeat
			};
		}
		document.body.style.backgroundImage = `url("${this.file(this.config.backgroundImage)}")`;
		document.body.style.backgroundSize = "cover";
		document.body.style.backgroundPosition = "center";
		document.body.style.backgroundRepeat = "no-repeat";
	},

	restoreBoardBackground() {
		if (!this.boardBackground || !document.body?.style) return;
		document.body.style.backgroundImage = this.boardBackground.image;
		document.body.style.backgroundSize = this.boardBackground.size;
		document.body.style.backgroundPosition = this.boardBackground.position;
		document.body.style.backgroundRepeat = this.boardBackground.repeat;
		this.boardBackground = null;
	},

	setBoardFont() {
		if (!document.body?.style) return;
		if (this.config.displayFont === "default") return this.restoreBoardFont();
		if (!Object.hasOwn(this, "boardFont")) this.boardFont = document.body.style.fontFamily;
		document.body.style.fontFamily = SchoolAthleticsConfig.displayFontFamily(this.config.displayFont);
	},

	restoreBoardFont() {
		if (!Object.hasOwn(this, "boardFont") || !document.body?.style) return;
		document.body.style.fontFamily = this.boardFont;
		delete this.boardFont;
	},

	message(text, type) {
		const element = document.createElement("div");
		element.className = `school-athletics-message ${type}`;
		element.textContent = text;
		return element;
	},

	buildPane(kind, heading, games) {
		const pane = document.createElement("section");
		const count = games.today.length;
		pane.className = `school-athletics-pane school-athletics-${kind} ${this.densityClass(count)}`;

		const header = document.createElement("header");
		header.className = "school-athletics-pane-header";

		const title = document.createElement("h2");
		if (kind === "home" && this.config.schoolLogo) {
			const logo = document.createElement("img");
			logo.className = "school-athletics-school-logo";
			logo.src = this.file(this.config.schoolLogo);
			logo.alt = this.config.schoolName ? `${this.config.schoolName} logo` : "School logo";
			logo.addEventListener("error", () => logo.remove());
			title.appendChild(logo);
		}
		const headingText = document.createElement("span");
		headingText.textContent = heading;
		title.appendChild(headingText);
		header.appendChild(title);

		const date = document.createElement("div");
		date.className = "school-athletics-today-date";
		date.textContent = new Intl.DateTimeFormat(this.config.locale, {
			weekday: "long",
			month: "long",
			day: "numeric",
			timeZone: "UTC"
		}).format(new Date(`${this.schedule.date}T12:00:00Z`));
		header.appendChild(date);
		pane.appendChild(header);

		const today = document.createElement("div");
		today.className = "school-athletics-today-list";

		if (count === 0) {
			const empty = document.createElement("div");
			empty.className = "school-athletics-empty";
			empty.textContent = `NO ${kind.toUpperCase()} GAMES TODAY`;
			today.appendChild(empty);
		} else {
			games.today.forEach(game => today.appendChild(this.buildTodayGame(game)));
		}

		pane.appendChild(today);

		if (games.upcoming.length > 0) {
			pane.appendChild(this.buildUpcoming(kind, games.upcoming));
		}

		if (this.config.showLastUpdated && this.lastUpdated) {
			const updated = document.createElement("div");
			updated.className = "school-athletics-updated";
			updated.textContent = `Updated ${this.formatTime(this.lastUpdated)}`;
			pane.appendChild(updated);
		}

		return pane;
	},

	buildTodayGame(game) {
		const row = document.createElement("article");
		row.className = `school-athletics-game${game.cancelled ? " cancelled" : ""}`;

		const time = document.createElement("div");
		time.className = "school-athletics-game-time";
		time.textContent = game.allDay ? "ALL DAY" : this.formatTime(game.start);
		row.appendChild(time);

		const details = document.createElement("div");
		details.className = "school-athletics-game-details";

		const team = document.createElement("div");
		team.className = "school-athletics-game-team";
		team.textContent = game.team;
		details.appendChild(team);

		const secondaryText = game.opponent || game.location;
		if (secondaryText) {
			const secondary = document.createElement("div");
			secondary.className = "school-athletics-game-opponent";
			secondary.textContent = game.opponent
				? `${game.kind === "away" ? "at" : "vs"} ${game.opponent}`
				: game.location;
			details.appendChild(secondary);
		}

		if (game.cancelled) {
			const cancelled = document.createElement("span");
			cancelled.className = "school-athletics-cancelled-label";
			cancelled.textContent = "CANCELLED";
			details.appendChild(cancelled);
		}

		row.appendChild(details);

		if (this.config.logos.enabled && game.logoUrl) {
			const logo = document.createElement("img");
			logo.className = "school-athletics-game-logo";
			logo.src = game.logoUrl;
			logo.alt = game.opponent ? `${game.opponent} logo` : "";
			logo.loading = "lazy";
			logo.referrerPolicy = "no-referrer";

			logo.addEventListener("error", () => {
				logo.remove();
			});

			row.appendChild(logo);
		}

		return row;
	},

	buildUpcoming(kind, games) {
		const section = document.createElement("div");
		section.className = "school-athletics-upcoming";

		const title = document.createElement("h3");
		title.textContent = `UPCOMING ${kind.toUpperCase()}`;
		section.appendChild(title);

		games.forEach(game => {
			const row = document.createElement("div");
			row.className = `school-athletics-upcoming-row${game.cancelled ? " cancelled" : ""}`;

			const when = document.createElement("span");
			when.className = "school-athletics-upcoming-when";
			when.textContent = `${this.formatShortDate(game.date)} · ${game.allDay ? "All Day" : this.formatTime(game.start)}`;
			row.appendChild(when);

			const name = document.createElement("span");
			name.className = "school-athletics-upcoming-name";
			name.textContent = game.opponent
				? `${game.team} ${game.kind === "away" ? "at" : "vs"} ${game.opponent}`
				: game.team;
			if (game.cancelled) name.textContent += " · CANCELLED";
			row.appendChild(name);
			section.appendChild(row);
		});

		return section;
	},

	densityClass(count) {
		if (count <= 1) return "density-feature";
		if (count <= 3) return "density-comfortable";
		if (count <= 5) return "density-compact";
		return "density-dense";
	},

	formatTime(value) {
		return new Intl.DateTimeFormat(this.config.locale, {
			hour12: this.config.timeFormat === "12h",
			hour: "numeric",
			minute: "2-digit",
			timeZone: this.config.timeZone
		}).format(new Date(value));
	},

	formatShortDate(value) {
		return new Intl.DateTimeFormat(this.config.locale, {
			weekday: "short",
			month: "short",
			day: "numeric",
			timeZone: "UTC"
		}).format(new Date(`${value}T12:00:00Z`));
	}
});
