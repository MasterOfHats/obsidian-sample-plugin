import {ItemView, TFile, WorkspaceLeaf, debounce, EventRef} from "obsidian";
import {VIEW_TYPE_SOLAR_SYSTEM, PlanetData, StarData, PLANET_DEFAULTS, STAR_DEFAULTS} from "../types";
import {render, hitTest} from "./SolarSystemRenderer";
import MyPlugin from "../main";

export class SolarSystemView extends ItemView {
	private plugin: MyPlugin;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private planets: PlanetData[] = [];
	private stars: StarData[] = [];
	private selectedStar: StarData | null = null;
	private animFrameId: number | null = null;
	private startTime = 0;
	private resizeObserver: ResizeObserver | null = null;
	private eventRefs: EventRef[] = [];
	private dropdown: HTMLSelectElement;

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SOLAR_SYSTEM;
	}

	getDisplayText(): string {
		return this.selectedStar?.name ?? "Solar System";
	}

	getIcon(): string {
		return "sun";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("solar-system-container");

		// Toolbar with star selector dropdown
		const toolbar = container.createEl("div", {cls: "solar-system-toolbar"});
		const label = toolbar.createEl("label", {text: "Star system: ", cls: "solar-system-label"});
		this.dropdown = label.createEl("select", {cls: "solar-system-select"});
		this.dropdown.addEventListener("change", () => {
			this.onStarSelected(this.dropdown.value);
		});

		this.canvas = container.createEl("canvas", {cls: "solar-system-canvas"});
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;
		this.ctx = ctx;

		this.resizeCanvas();

		this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
		this.resizeObserver.observe(container);

		this.canvas.addEventListener("click", this.onClick);
		this.canvas.addEventListener("mousemove", this.onMouseMove);

		this.loadStars();
		this.startAnimation();

		const debouncedReload = debounce(() => this.loadStars(), 150, true);

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
		this.stopAnimation();
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		this.canvas?.removeEventListener("click", this.onClick);
		this.canvas?.removeEventListener("mousemove", this.onMouseMove);
		for (const ref of this.eventRefs) {
			this.app.metadataCache.offref(ref);
			this.app.vault.offref(ref);
		}
		this.eventRefs = [];
	}

	onResize(): void {
		this.resizeCanvas();
	}

	refresh(): void {
		this.loadStars();
		this.startAnimation();
	}

	private isInFolder(file: TFile): boolean {
		const folder = this.plugin.settings.solarSystemFolder;
		if (!folder) return false;
		return file.path.startsWith(folder + "/");
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

	private loadStars(): void {
		const folder = this.plugin.settings.solarSystemFolder;
		if (!folder) {
			this.stars = [];
			this.selectedStar = null;
			this.planets = [];
			this.populateDropdown();
			return;
		}

		const abstractFolder = this.app.vault.getAbstractFileByPath(folder);
		if (!abstractFolder) {
			this.stars = [];
			this.selectedStar = null;
			this.planets = [];
			this.populateDropdown();
			return;
		}

		const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"));

		this.stars = files
			.filter(file => {
				const cache = this.app.metadataCache.getFileCache(file);
				const locationType = cache?.frontmatter?.LocationType;
				return typeof locationType === "string" && locationType.toLowerCase() === "star";
			})
			.map(file => {
				const cache = this.app.metadataCache.getFileCache(file);
				const fm = cache?.frontmatter;
				return {
					name: file.basename,
					filePath: file.path,
					color: typeof fm?.star_color === "string" ? fm.star_color : STAR_DEFAULTS.color,
					size: this.numOrDefault(fm?.star_size, STAR_DEFAULTS.size),
				};
			});

		// Restore selection or default to first star
		const savedName = this.plugin.settings.selectedStar;
		const match = this.stars.find(s => s.name === savedName);
		if (match) {
			this.selectedStar = match;
		} else if (this.stars.length > 0) {
			this.selectedStar = this.stars[0]!;
		} else {
			this.selectedStar = null;
		}

		this.populateDropdown();
		this.loadPlanets();

		// Update the leaf header title
		(this.leaf as unknown as {updateHeader(): void}).updateHeader();
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

	private populateDropdown(): void {
		this.dropdown.empty();
		for (const star of this.stars) {
			const opt = this.dropdown.createEl("option", {text: star.name, value: star.name});
			if (this.selectedStar && star.name === this.selectedStar.name) {
				opt.selected = true;
			}
		}
		if (this.stars.length === 0) {
			this.dropdown.createEl("option", {text: "(no stars found)", value: ""});
			this.dropdown.disabled = true;
		} else {
			this.dropdown.disabled = false;
		}
	}

	private async onStarSelected(name: string): Promise<void> {
		const star = this.stars.find(s => s.name === name);
		if (!star) return;
		this.selectedStar = star;
		this.plugin.settings.selectedStar = star.name;
		await this.plugin.saveData(this.plugin.settings);
		this.loadPlanets();
		(this.leaf as unknown as {updateHeader(): void}).updateHeader();
	}

	private numOrDefault(value: unknown, fallback: number): number {
		return typeof value === "number" && isFinite(value) ? value : fallback;
	}

	private startAnimation(): void {
		this.startTime = performance.now() / 1000;
		const frame = (): void => {
			const time = performance.now() / 1000 - this.startTime;
			const dpr = window.devicePixelRatio || 1;
			const width = this.canvas.width / dpr;
			const height = this.canvas.height / dpr;
			this.ctx.save();
			render(this.ctx, width, height, this.planets, time, this.selectedStar);
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

	private getCanvasCoords(evt: MouseEvent): {x: number; y: number} {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: evt.clientX - rect.left,
			y: evt.clientY - rect.top,
		};
	}

	private currentTime(): number {
		return performance.now() / 1000 - this.startTime;
	}

	private canvasDimensions(): {width: number; height: number} {
		const dpr = window.devicePixelRatio || 1;
		return {
			width: this.canvas.width / dpr,
			height: this.canvas.height / dpr,
		};
	}

	private onClick = (evt: MouseEvent): void => {
		const {x, y} = this.getCanvasCoords(evt);
		const {width, height} = this.canvasDimensions();
		const planet = hitTest(x, y, width, height, this.planets, this.currentTime());
		if (planet) {
			const file = this.app.vault.getAbstractFileByPath(planet.filePath);
			if (file instanceof TFile) {
				this.app.workspace.getLeaf(false).openFile(file);
			}
		}
	};

	private onMouseMove = (evt: MouseEvent): void => {
		const {x, y} = this.getCanvasCoords(evt);
		const {width, height} = this.canvasDimensions();
		const planet = hitTest(x, y, width, height, this.planets, this.currentTime());
		this.canvas.style.cursor = planet ? "pointer" : "";
	};
}
