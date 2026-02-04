import {PlanetData, StarData, STAR_DEFAULTS} from "../types";

interface PlanetPosition {
	x: number;
	y: number;
	planet: PlanetData;
}

function computePositions(
	width: number,
	height: number,
	planets: PlanetData[],
	time: number
): PlanetPosition[] {
	const cx = width / 2;
	const cy = height / 2;
	const margin = 60;
	const maxOrbit = planets.reduce((m, p) => Math.max(m, p.orbitRadius), 0);
	const availableRadius = Math.min(cx, cy) - margin;
	const scale = maxOrbit > 0 ? availableRadius / maxOrbit : 1;

	return planets.map(planet => {
		const angle = planet.startAngle + planet.orbitSpeed * time;
		const r = planet.orbitRadius * scale;
		return {
			x: cx + Math.cos(angle) * r,
			y: cy + Math.sin(angle) * r,
			planet,
		};
	});
}

export function render(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	planets: PlanetData[],
	time: number,
	star: StarData | null
): void {
	const cx = width / 2;
	const cy = height / 2;
	const margin = 60;
	const maxOrbit = planets.reduce((m, p) => Math.max(m, p.orbitRadius), 0);
	const availableRadius = Math.min(cx, cy) - margin;
	const scale = maxOrbit > 0 ? availableRadius / maxOrbit : 1;

	const starColor = star?.color ?? STAR_DEFAULTS.color;
	const starRadius = star?.size ?? STAR_DEFAULTS.size;
	const starName = star?.name ?? "Star";

	// Clear
	ctx.clearRect(0, 0, width, height);

	// Orbit rings
	ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
	ctx.lineWidth = 1;
	for (const planet of planets) {
		const r = planet.orbitRadius * scale;
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.stroke();
	}

	// Star — derive gradient from the star's color
	const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, starRadius);
	gradient.addColorStop(0, "#fff8e1");
	gradient.addColorStop(0.5, starColor);
	gradient.addColorStop(1, darkenColor(starColor, 0.6));
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(cx, cy, starRadius, 0, Math.PI * 2);
	ctx.fill();

	// Star glow
	const glowGradient = ctx.createRadialGradient(cx, cy, starRadius, cx, cy, starRadius * 2.5);
	glowGradient.addColorStop(0, hexToRgba(starColor, 0.3));
	glowGradient.addColorStop(1, hexToRgba(starColor, 0));
	ctx.fillStyle = glowGradient;
	ctx.beginPath();
	ctx.arc(cx, cy, starRadius * 2.5, 0, Math.PI * 2);
	ctx.fill();

	// Star label
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 14px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	ctx.fillText(starName, cx, cy + starRadius + 6);

	// Planets
	const positions = computePositions(width, height, planets, time);
	for (const pos of positions) {
		const {x, y, planet} = pos;

		// Planet body
		ctx.fillStyle = planet.color;
		ctx.beginPath();
		ctx.arc(x, y, planet.size, 0, Math.PI * 2);
		ctx.fill();

		// Planet label
		ctx.fillStyle = "#ffffff";
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(planet.name, x, y + planet.size + 4);
	}
}

function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darkenColor(hex: string, factor: number): string {
	const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
	const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
	const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function hitTest(
	x: number,
	y: number,
	width: number,
	height: number,
	planets: PlanetData[],
	time: number
): PlanetData | null {
	const positions = computePositions(width, height, planets, time);
	for (const pos of positions) {
		const dx = x - pos.x;
		const dy = y - pos.y;
		const hitRadius = Math.max(pos.planet.size, 8) + 4;
		if (dx * dx + dy * dy <= hitRadius * hitRadius) {
			return pos.planet;
		}
	}
	return null;
}
