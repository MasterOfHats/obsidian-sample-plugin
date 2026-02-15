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

	// Pan/scroll state for starway view
	private panX = 0;
	private panY = 0;
	private isDragging = false;
	private didDrag = false;  // True if mouse moved significantly during drag
	private dragStartX = 0;
	private dragStartY = 0;
	private dragStartPanX = 0;
	private dragStartPanY = 0;

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

		const list = wrapper.createEl("div", {cls: "starway-selector-list"});
		for (const name of this.starways) {
			const btn = list.createEl("button", {
				text: name,
				cls: "starway-selector-btn",
			});
			if (this.selectedStarway === name) btn.addClass("is-active");
			btn.addEventListener("click", () => this.selectStarway(name));
		}
	}

	// ── Starway view (constellation canvas) ──────────────────

	private showStarway(): void {
		this.mode = "starway";
		// Reset pan position for new starway view
		this.panX = 0;
		this.panY = 0;
		this.buildCanvasDOM("Starways", () => this.showSelector(), {
			label: "Add Star",
			icon: "plus",
			onAdd: () => this.createStar(),
		});
		this.canvas.style.cursor = "grab";
		this.startAnimation();
		this.updateHeader();
	}

	// ── System view (solar system canvas) ────────────────────

	private showSystem(): void {
		this.mode = "system";
		const label = this.selectedStarway ?? "Stars";
		this.buildCanvasDOM(label, () => this.showStarway(), {
			label: "Add Planet",
			icon: "plus",
			onAdd: () => this.createPlanet(),
		});
		this.loadPlanets();
		this.startAnimation();
		this.updateHeader();
	}

	// ── Shared canvas DOM ────────────────────────────────────

	private buildCanvasDOM(backLabel: string, onBack: () => void, addOpts?: {label: string; icon: string; onAdd: () => void}): void {
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

		if (addOpts) {
			const addBtn = toolbar.createEl("button", {
				cls: "solar-system-add-btn",
				attr: {"aria-label": addOpts.label},
			});
			setIcon(addBtn, addOpts.icon);
			addBtn.createEl("span", {text: addOpts.label});
			addBtn.addEventListener("click", addOpts.onAdd);
		}

		this.canvas = container.createEl("canvas", {cls: "solar-system-canvas"});
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;
		this.ctx = ctx;

		this.resizeCanvas();
		this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
		this.resizeObserver.observe(container);

		this.canvas.addEventListener("click", this.onCanvasClick);
		this.canvas.addEventListener("mousemove", this.onCanvasMouseMove);
		this.canvas.addEventListener("mousedown", this.onCanvasMouseDown);
		this.canvas.addEventListener("mouseup", this.onCanvasMouseUp);
		this.canvas.addEventListener("mouseleave", this.onCanvasMouseUp);
	}

	private teardownCanvas(): void {
		this.stopAnimation();
		this.canvas?.removeEventListener("click", this.onCanvasClick);
		this.canvas?.removeEventListener("mousemove", this.onCanvasMouseMove);
		this.canvas?.removeEventListener("mousedown", this.onCanvasMouseDown);
		this.canvas?.removeEventListener("mouseup", this.onCanvasMouseUp);
		this.canvas?.removeEventListener("mouseleave", this.onCanvasMouseUp);
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	private resizeCanvas(): void {
		const dpr = window.devicePixelRatio || 1;
		// Use the canvas's actual laid-out size from CSS
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return; // Not laid out yet
		this.canvas.width = rect.width * dpr;
		this.canvas.height = rect.height * dpr;
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

	// ── File creation ─────────────────────────────────────────

	private async createStar(): Promise<void> {
		const folder = this.plugin.settings.solarSystemFolder;
		if (!folder || !this.selectedStarway) return;

		const name = await this.uniqueName(folder, "New Star");
		const lastPos = this.starwayStars.length > 0
			? Math.max(...this.starwayStars.map(s => s.position))
			: -1;
		const content = [
			"---",
			"LocationType: Star",
			`Starway: ${this.selectedStarway}`,
			`SW_Position: ${lastPos + 1}`,
			`star_color: "${STAR_DEFAULTS.color}"`,
			`star_size: ${STAR_DEFAULTS.size}`,
			"---",
			"",
		].join("\n");

		const file = await this.app.vault.create(`${folder}/${name}.md`, content);
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async createPlanet(): Promise<void> {
		const folder = this.plugin.settings.solarSystemFolder;
		if (!folder || !this.selectedStar) return;

		const name = await this.uniqueName(folder, "New Planet");
		const content = [
			"---",
			"LocationType: Planet",
			`LocationParent: ${this.selectedStar.name}`,
			`orbit_radius: ${PLANET_DEFAULTS.orbitRadius}`,
			`planet_size: ${PLANET_DEFAULTS.size}`,
			`planet_color: "${PLANET_DEFAULTS.color}"`,
			`orbit_speed: ${PLANET_DEFAULTS.orbitSpeed}`,
			`start_angle: ${PLANET_DEFAULTS.startAngle}`,
			"---",
			"",
		].join("\n");

		const file = await this.app.vault.create(`${folder}/${name}.md`, content);
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async uniqueName(folder: string, base: string): Promise<string> {
		let name = base;
		let i = 1;
		while (this.app.vault.getAbstractFileByPath(`${folder}/${name}.md`)) {
			i++;
			name = `${base} ${i}`;
		}
		return name;
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
			const {width, height} = this.canvasDimensions();
			this.ctx.save();
			if (this.mode === "starway") {
				const virtualSize = this.getVirtualSize();
				// Apply pan offset
				this.ctx.translate(-this.panX, -this.panY);
				renderStarway(this.ctx, virtualSize.width, virtualSize.height, this.starwayStars, time, this.selectedStarway ?? "");
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
		const rect = this.canvas.getBoundingClientRect();
		return {width: rect.width, height: rect.height};
	}

	private getVirtualSize(): {width: number; height: number} {
		const {width, height} = this.canvasDimensions();
		if (this.mode !== "starway" || this.starwayStars.length === 0) {
			return {width, height};
		}

		// Calculate virtual size based on star positions
		// Stars are laid out vertically: distY = i * 0.2 * radius
		// where radius = Math.min(cx, cy) - margin
		const margin = 80;
		const radius = Math.min(width / 2, height / 2) - margin;

		// Get the position range from stars
		const firstPos = this.starwayStars[0]?.position ?? 0;
		const lastPos = this.starwayStars[this.starwayStars.length - 1]?.position ?? 0;
		const starCount = lastPos - firstPos + 1;

		// Calculate required height: center + all star offsets + margin for labels
		const maxStarOffset = (starCount - 1) * 0.2 * radius;
		const virtualHeight = Math.max(height, height / 2 + maxStarOffset + margin + 50);

		// Width stays the same since horizontal spread is bounded by radius
		return {width, height: virtualHeight};
	}

	private onCanvasClick = (evt: MouseEvent): void => {
		// Don't trigger click if we were dragging
		if (this.didDrag) {
			this.didDrag = false;
			return;
		}

		const {x, y} = this.getCanvasCoords(evt);
		const {width, height} = this.canvasDimensions();

		if (this.mode === "starway") {
			const virtualSize = this.getVirtualSize();
			// Adjust click coordinates for pan offset
			const star = starwayHitTest(x + this.panX, y + this.panY, virtualSize.width, virtualSize.height, this.starwayStars);
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

		// Handle dragging for pan
		if (this.isDragging && this.mode === "starway") {
			const dx = evt.clientX - this.dragStartX;
			const dy = evt.clientY - this.dragStartY;

			// Mark as drag if moved more than 5 pixels
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
				this.didDrag = true;
			}

			const virtualSize = this.getVirtualSize();

			// Update pan with bounds checking
			this.panX = Math.max(0, Math.min(virtualSize.width - width, this.dragStartPanX - dx));
			this.panY = Math.max(0, Math.min(virtualSize.height - height, this.dragStartPanY - dy));
			return;
		}

		if (this.mode === "starway") {
			const virtualSize = this.getVirtualSize();
			const star = starwayHitTest(x + this.panX, y + this.panY, virtualSize.width, virtualSize.height, this.starwayStars);
			this.canvas.style.cursor = star ? "pointer" : "grab";
		} else if (this.mode === "system") {
			const planet = hitTest(x, y, width, height, this.planets, this.currentTime());
			this.canvas.style.cursor = planet ? "pointer" : "";
		}
	};

	private onCanvasMouseDown = (evt: MouseEvent): void => {
		if (this.mode === "starway") {
			this.isDragging = true;
			this.didDrag = false;
			this.dragStartX = evt.clientX;
			this.dragStartY = evt.clientY;
			this.dragStartPanX = this.panX;
			this.dragStartPanY = this.panY;
			this.canvas.style.cursor = "grabbing";
		}
	};

	private onCanvasMouseUp = (): void => {
		if (this.isDragging) {
			this.isDragging = false;
			this.canvas.style.cursor = "grab";
		}
	};

	private updateHeader(): void {
		(this.leaf as unknown as {updateHeader(): void}).updateHeader();
	}
}
