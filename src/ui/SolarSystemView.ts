import {ItemView, TFile, WorkspaceLeaf, debounce, EventRef} from "obsidian";
import {VIEW_TYPE_SOLAR_SYSTEM, PlanetData, PLANET_DEFAULTS} from "../types";
import {render, hitTest} from "./SolarSystemRenderer";
import MyPlugin from "../main";

export class SolarSystemView extends ItemView {
	private plugin: MyPlugin;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private planets: PlanetData[] = [];
	private animFrameId: number | null = null;
	private startTime = 0;
	private resizeObserver: ResizeObserver | null = null;
	private eventRefs: EventRef[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SOLAR_SYSTEM;
	}

	getDisplayText(): string {
		return this.plugin.settings.starName || "Solar System";
	}

	getIcon(): string {
		return "sun";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("solar-system-container");

		this.canvas = container.createEl("canvas", {cls: "solar-system-canvas"});
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;
		this.ctx = ctx;

		this.resizeCanvas();

		this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
		this.resizeObserver.observe(container);

		this.canvas.addEventListener("click", this.onClick);
		this.canvas.addEventListener("mousemove", this.onMouseMove);

		this.loadPlanets();
		this.startAnimation();

		const debouncedReload = debounce(() => this.loadPlanets(), 150, true);

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
		this.loadPlanets();
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

	private loadPlanets(): void {
		const folder = this.plugin.settings.solarSystemFolder;
		if (!folder) {
			this.planets = [];
			return;
		}

		const abstractFolder = this.app.vault.getAbstractFileByPath(folder);
		if (!abstractFolder) {
			this.planets = [];
			return;
		}

		const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + "/"));

		this.planets = files.map(file => {
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
			render(this.ctx, width, height, this.planets, time, this.plugin.settings.starName);
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
