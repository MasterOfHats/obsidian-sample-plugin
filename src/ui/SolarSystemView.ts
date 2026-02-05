import {ItemView, TFile, WorkspaceLeaf, debounce, EventRef, setIcon} from "obsidian";
import {VIEW_TYPE_SOLAR_SYSTEM, PlanetData, StarData, PLANET_DEFAULTS, STAR_DEFAULTS} from "../types";
import {render, hitTest} from "./SolarSystemRenderer";
import {renderStarway, starwayHitTest} from "./StarwayRenderer";
import MyPlugin from "../main";

type ViewMode = "selector" | "starway" | "system";

export class SolarSystemView extends ItemView {
	private plugin: MyPlugin;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private planets: PlanetData[] = [];
	private allStars: StarData[] = [];
	private starwayStars: StarData[] = [];
	private starways: string[] = [];
	private selectedStarway: string | null = null;
	private selectedStar: StarData | null = null;
	private animFrameId: number | null = null;
	private startTime = 0;
	private resizeObserver: ResizeObserver | null = null;
	private eventRefs: EventRef[] = [];
	private mode: ViewMode = "selector";

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SOLAR_SYSTEM;
	}

	getDisplayText(): string {
		if (this.mode === "system" && this.selectedStar) return this.selectedStar.name;
		if (this.mode === "starway" && this.selectedStarway) return this.selectedStarway;
		return "Solar System";
	}

	getIcon(): string {
		return "sun";
	}

	async onOpen(): Promise<void> {
		this.loadAllStars();

		// Restore deepest saved state
		if (this.selectedStar && this.selectedStarway) {
			this.filterStarwayStars();
			this.showSystem();
		} else if (this.selectedStarway) {
			this.filterStarwayStars();
			this.showStarway();
		} else {
			this.showSelector();
		}

		const debouncedReload = debounce(() => this.reloadData(), 150, true);

		this.eventRefs.push(
			this.app.metadataCache.on("changed", (file) => {
				if (this.isInFolder(file)) debouncedReload();
			})
		);
		this.eventRefs.push(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && this.isInFolder(file)) debouncedReload();
			})
		);
		this.eventRefs.push(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && this.isInFolder(file)) debouncedReload();
			})
		);
		this.eventRefs.push(
			this.app.vault.on("rename", () => debouncedReload())
		);
	}

	async onClose(): Promise<void> {
		this.teardownCanvas();
		for (const ref of this.eventRefs) {
			this.app.metadataCache.offref(ref);
			this.app.vault.offref(ref);
		}
		this.eventRefs = [];
	}

	onResize(): void {
		if (this.mode === "system" || this.mode === "starway") {
			this.resizeCanvas();
		}
	}

	refresh(): void {
		this.reloadData();
	}

	private reloadData(): void {
		this.loadAllStars();
		if (this.selectedStarway) this.filterStarwayStars();
		if (this.mode === "system") {
			this.loadPlanets();
			this.startAnimation();
		} else if (this.mode === "starway") {
			this.startAnimation();
		} else {
			this.renderSelector();
		}
	}

	// ── Selector view (dropdown) ─────────────────────────────

	private showSelector(): void {
		this.mode = "selector";
		this.teardownCanvas();
		this.renderSelector();
		this.updateHeader();
	}

	private renderSelector(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("solar-system-container");

		const wrapper = container.createEl("div", {cls: "starway-selector"});
		wrapper.createEl("h2", {text: "Select a starway", cls: "starway-selector-title"});

		if (this.starways.length === 0) {
			wrapper.createEl("p", {
				text: "No starways found. Add a Starway property to your Star files.",
				cls: "starway-selector-empty",
			});
			return;
		}

		const select = wrapper.createEl("select", {cls: "starway-selector-dropdown"});
		select.createEl("option", {text: "-- choose --", value: ""});
		for (const name of this.starways) {
			const opt = select.createEl("option", {text: name, value: name});
			if (this.selectedStarway === name) opt.selected = true;
		}
		select.addEventListener("change", () => {
			if (select.value) this.selectStarway(select.value);
		});
	}

	// ── Starway view (constellation canvas) ──────────────────

	private showStarway(): void {
		this.mode = "starway";
		this.buildCanvasDOM("Starways", () => this.showSelector());
		this.startAnimation();
		this.updateHeader();
	}

	// ── System view (solar system canvas) ────────────────────

	private showSystem(): void {
		this.mode = "system";
		const label = this.selectedStarway ?? "Stars";
		this.buildCanvasDOM(label, () => this.showStarway());
		this.loadPlanets();
		this.startAnimation();
		this.updateHeader();
	}

	// ── Shared canvas DOM ────────────────────────────────────

	private buildCanvasDOM(backLabel: string, onBack: () => void): void {
		this.teardownCanvas();

		const container = this.contentEl;
		container.empty();
		container.addClass("solar-system-container");

		const toolbar = container.createEl("div", {cls: "solar-system-toolbar"});
		const backBtn = toolbar.createEl("button", {
			cls: "solar-system-back-btn",
			attr: {"aria-label": `Back to ${backLabel}`},
		});
		setIcon(backBtn, "arrow-left");
		backBtn.createEl("span", {text: backLabel});
		backBtn.addEventListener("click", onBack);

		this.canvas = container.createEl("canvas", {cls: "solar-system-canvas"});
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;
		this.ctx = ctx;

		this.resizeCanvas();
		this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
		this.resizeObserver.observe(container);

		this.canvas.addEventListener("click", this.onCanvasClick);
		this.canvas.addEventListener("mousemove", this.onCanvasMouseMove);
	}

	private teardownCanvas(): void {
		this.stopAnimation();
		this.canvas?.removeEventListener("click", this.onCanvasClick);
		this.canvas?.removeEventListener("mousemove", this.onCanvasMouseMove);
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	private resizeCanvas(): void {
		const container = this.contentEl;
		const dpr = window.devicePixelRatio || 1;
		const width = container.clientWidth;
		const height = container.clientHeight;
		this.canvas.width = width * dpr;
		this.canvas.height = height * dpr;
		this.canvas.style.width = width + "px";
		this.canvas.style.height = height + "px";
		this.ctx?.scale(dpr, dpr);
	}

	// ── Selection actions ────────────────────────────────────

	private async selectStarway(name: string): Promise<void> {
		this.selectedStarway = name;
		this.selectedStar = null;
		this.plugin.settings.selectedStarway = name;
		this.plugin.settings.selectedStar = "";
		await this.plugin.saveData(this.plugin.settings);
		this.filterStarwayStars();
		this.showStarway();
	}

	private async selectStar(star: StarData): Promise<void> {
		this.selectedStar = star;
		this.plugin.settings.selectedStar = star.name;
		await this.plugin.saveData(this.plugin.settings);
		this.showSystem();
	}

	// ── Data loading ─────────────────────────────────────────

	private isInFolder(file: TFile): boolean {
		const folder = this.plugin.settings.solarSystemFolder;
		if (!folder) return false;
		return file.path.startsWith(folder + "/");
	}

	private loadAllStars(): void {
		const folder = this.plugin.settings.solarSystemFolder;
		if (!folder) {
			this.allStars = [];
			this.starways = [];
			this.selectedStarway = null;
			this.selectedStar = null;
			this.planets = [];
			return;
		}

		const abstractFolder = this.app.vault.getAbstractFileByPath(folder);
		if (!abstractFolder) {
			this.allStars = [];
			this.starways = [];
			this.selectedStarway = null;
			this.selectedStar = null;
			this.planets = [];
			return;
		}

		const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"));

		this.allStars = files
			.filter(file => {
				const cache = this.app.metadataCache.getFileCache(file);
				const lt = cache?.frontmatter?.LocationType;
				const sw = cache?.frontmatter?.Starway;
				const pos = cache?.frontmatter?.SW_Position
				return (
					typeof lt === "string" && lt.toLowerCase() === "star" &&
					typeof sw === "string" && sw.length > 0 && typeof pos === "number"
				);
			})
			.map(file => {
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				return {
					name: file.basename,
					filePath: file.path,
					color: typeof fm?.star_color === "string" ? fm.star_color : STAR_DEFAULTS.color,
					size: this.numOrDefault(fm?.star_size, STAR_DEFAULTS.size),
					starway: fm!.Starway as string,
					position: fm!.SW_Position as number
				};
			});

		// Collect unique starway names, sorted alphabetically
		const swSet = new Set(this.allStars.map(s => s.starway));
		this.starways = [...swSet].sort();

		// Restore saved starway
		const savedSW = this.plugin.settings.selectedStarway;
		if (savedSW && swSet.has(savedSW)) {
			this.selectedStarway = savedSW;
		} else if (this.starways.length > 0) {
			this.selectedStarway = this.starways[0]!;
		} else {
			this.selectedStarway = null;
		}

		// Restore saved star
		if (this.selectedStarway) {
			this.filterStarwayStars();
			const savedStar = this.plugin.settings.selectedStar;
			const match = this.starwayStars.find(s => s.name === savedStar);
			this.selectedStar = match ?? null;
		} else {
			this.starwayStars = [];
			this.selectedStar = null;
		}
	}

	private filterStarwayStars(): void {
		this.starwayStars = this.allStars.filter(s => s.starway === this.selectedStarway);
		this.starwayStars = this.starwayStars.sort( (a, b) => a.position - b.position)
	}

	private loadPlanets(): void {
		if (!this.selectedStar) {
			this.planets = [];
			return;
		}

		const folder = this.plugin.settings.solarSystemFolder;
		if (!folder) {
			this.planets = [];
			return;
		}

		const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"));
		const starName = this.selectedStar.name;

		this.planets = files
			.filter(file => {
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				const locationType = fm?.LocationType;
				const locationParent = fm?.LocationParent;
				return (
					typeof locationType === "string" &&
					locationType.toLowerCase() === "planet" &&
					typeof locationParent === "string" &&
					locationParent === starName
				);
			})
			.map(file => {
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				return {
					name: file.basename,
					filePath: file.path,
					orbitRadius: this.numOrDefault(fm?.orbit_radius, PLANET_DEFAULTS.orbitRadius),
					size: this.numOrDefault(fm?.planet_size, PLANET_DEFAULTS.size),
					color: typeof fm?.planet_color === "string" ? fm.planet_color : PLANET_DEFAULTS.color,
					orbitSpeed: this.numOrDefault(fm?.orbit_speed, PLANET_DEFAULTS.orbitSpeed),
					startAngle: this.numOrDefault(fm?.start_angle, PLANET_DEFAULTS.startAngle) * (Math.PI / 180),
				};
			});
	}

	// ── Animation ────────────────────────────────────────────

	private startAnimation(): void {
		this.stopAnimation();
		this.startTime = performance.now() / 1000;
		const frame = (): void => {
			const time = performance.now() / 1000 - this.startTime;
			const dpr = window.devicePixelRatio || 1;
			const width = this.canvas.width / dpr;
			const height = this.canvas.height / dpr;
			this.ctx.save();
			if (this.mode === "starway") {
				renderStarway(this.ctx, width, height, this.starwayStars, time, this.selectedStarway ?? "");
			} else {
				render(this.ctx, width, height, this.planets, time, this.selectedStar);
			}
			this.ctx.restore();
			this.animFrameId = requestAnimationFrame(frame);
		};
		this.animFrameId = requestAnimationFrame(frame);
	}

	private stopAnimation(): void {
		if (this.animFrameId !== null) {
			cancelAnimationFrame(this.animFrameId);
			this.animFrameId = null;
		}
	}

	// ── Canvas interaction ───────────────────────────────────

	private numOrDefault(value: unknown, fallback: number): number {
		return typeof value === "number" && isFinite(value) ? value : fallback;
	}

	private getCanvasCoords(evt: MouseEvent): {x: number; y: number} {
		const rect = this.canvas.getBoundingClientRect();
		return {x: evt.clientX - rect.left, y: evt.clientY - rect.top};
	}

	private currentTime(): number {
		return performance.now() / 1000 - this.startTime;
	}

	private canvasDimensions(): {width: number; height: number} {
		const dpr = window.devicePixelRatio || 1;
		return {width: this.canvas.width / dpr, height: this.canvas.height / dpr};
	}

	private onCanvasClick = (evt: MouseEvent): void => {
		const {x, y} = this.getCanvasCoords(evt);
		const {width, height} = this.canvasDimensions();

		if (this.mode === "starway") {
			const star = starwayHitTest(x, y, width, height, this.starwayStars);
			if (star) this.selectStar(star);
		} else if (this.mode === "system") {
			const planet = hitTest(x, y, width, height, this.planets, this.currentTime());
			if (planet) {
				const file = this.app.vault.getAbstractFileByPath(planet.filePath);
				if (file instanceof TFile) {
					this.app.workspace.getLeaf(false).openFile(file);
				}
			}
		}
	};

	private onCanvasMouseMove = (evt: MouseEvent): void => {
		const {x, y} = this.getCanvasCoords(evt);
		const {width, height} = this.canvasDimensions();

		if (this.mode === "starway") {
			const star = starwayHitTest(x, y, width, height, this.starwayStars);
			this.canvas.style.cursor = star ? "pointer" : "";
		} else if (this.mode === "system") {
			const planet = hitTest(x, y, width, height, this.planets, this.currentTime());
			this.canvas.style.cursor = planet ? "pointer" : "";
		}
	};

	private updateHeader(): void {
		(this.leaf as unknown as {updateHeader(): void}).updateHeader();
	}
}
