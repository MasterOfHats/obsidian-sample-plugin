import {PlanetData, AsteroidData, StarData, STAR_DEFAULTS, PlanetTrait} from "../types";

interface PlanetPosition {
	x: number;
	y: number;
	planet: PlanetData;
}

function computePositions(
	planets: PlanetData[],
	time: number
): PlanetPosition[] {
	return planets.map(planet => {
		const angle = planet.startAngle + planet.orbitSpeed * time;
		return {
			x: Math.cos(angle) * planet.orbitRadius,
			y: Math.sin(angle) * planet.orbitRadius,
			planet,
		};
	});
}

/**
 * Renders the solar system at the origin (0, 0).
 * The caller should apply canvas transforms (translate/scale) for pan/zoom
 * and clear the canvas before calling this function.
 */
/** Simple deterministic hash for stable asteroid placement. */
function hash(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (h * 31 + s.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

/** Seeded pseudo-random (xorshift32). */
function seededRandom(seed: number): () => number {
	let s = seed | 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >> 17;
		s ^= s << 5;
		return (s >>> 0) / 0xFFFFFFFF;
	};
}

/** Pre-computed crater layout for a planet (offsets relative to centre). */
interface CraterLayout {
	offsets: {dx: number; dy: number; r: number; alpha: number}[];
}

/** Cache of crater layouts keyed by planet name, so we don't regenerate every frame. */
const craterCache = new Map<string, CraterLayout>();

/** Generate a stable, evenly-spaced crater layout for a given planet name + radius. */
function getCraterLayout(name: string, radius: number): CraterLayout {
	const key = `${name}:${radius}`;
	const cached = craterCache.get(key);
	if (cached) return cached;

	const rand = seededRandom(hash(`craters-${name}`));
	const targetCount = Math.max(3, Math.floor(radius * 0.8));
	const minSep = radius * 0.22; // minimum distance between crater centres
	const maxAttempts = targetCount * 20;

	const placed: {dx: number; dy: number; r: number; alpha: number}[] = [];
	let attempts = 0;

	while (placed.length < targetCount && attempts < maxAttempts) {
		attempts++;
		const angle = rand() * Math.PI * 2;
		// Bias toward edges with sqrt for uniform area distribution
		const dist = Math.sqrt(rand()) * radius * 0.8;
		const dx = Math.cos(angle) * dist;
		const dy = Math.sin(angle) * dist;
		const craterR = radius * (0.08 + rand() * 0.15);

		// Reject if too close to an existing crater
		let tooClose = false;
		for (const other of placed) {
			const sepX = dx - other.dx;
			const sepY = dy - other.dy;
			if (sepX * sepX + sepY * sepY < minSep * minSep) {
				tooClose = true;
				break;
			}
		}
		if (tooClose) continue;

		placed.push({dx, dy, r: craterR, alpha: 0.4 + rand() * 0.3});
	}

	const layout: CraterLayout = {offsets: placed};
	craterCache.set(key, layout);
	return layout;
}

/** Draw craters on a planet (NoAtmosphere trait). */
function drawCraters(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	radius: number,
	baseColor: string,
	name: string
): void {
	const layout = getCraterLayout(name, radius);
	const darkColor = darkenColor(baseColor, 0.55);

	ctx.save();
	// Clip to the planet circle so craters don't bleed outside
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.clip();

	for (const c of layout.offsets) {
		const craterX = cx + c.dx;
		const craterY = cy + c.dy;

		// Crater shadow (darker circle)
		ctx.fillStyle = hexToRgba(darkColor, c.alpha);
		ctx.beginPath();
		ctx.arc(craterX, craterY, c.r, 0, Math.PI * 2);
		ctx.fill();

		// Crater rim highlight (subtle lighter edge on one side)
		ctx.strokeStyle = hexToRgba(baseColor, 0.15);
		ctx.lineWidth = Math.max(0.5, c.r * 0.15);
		ctx.beginPath();
		ctx.arc(craterX, craterY, c.r, -Math.PI * 0.7, Math.PI * 0.3);
		ctx.stroke();
	}

	ctx.restore();
}

/** Draw a fresnel atmosphere glow around a planet (GoodAtmosphere trait). */
function drawAtmosphere(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	radius: number
): void {
	const atmosphereWidth = radius * 0.35;
	const outerR = radius + atmosphereWidth;

	// Outer glow — fades from transparent at the planet edge to blue, then back to transparent
	const glow = ctx.createRadialGradient(cx, cy, radius * 0.85, cx, cy, outerR);
	glow.addColorStop(0, "rgba(100, 180, 255, 0)");
	glow.addColorStop(0.35, "rgba(100, 180, 255, 0.15)");
	glow.addColorStop(0.65, "rgba(80, 160, 255, 0.25)");
	glow.addColorStop(1, "rgba(60, 140, 255, 0)");

	ctx.fillStyle = glow;
	ctx.beginPath();
	ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
	ctx.fill();

	// Inner fresnel rim — a bright edge ring just inside the planet outline
	const rim = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius);
	rim.addColorStop(0, "rgba(100, 180, 255, 0)");
	rim.addColorStop(0.75, "rgba(100, 180, 255, 0)");
	rim.addColorStop(0.92, "rgba(120, 200, 255, 0.2)");
	rim.addColorStop(1, "rgba(140, 210, 255, 0.35)");

	ctx.fillStyle = rim;
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.fill();
}

/** Draw trait effects on a planet body. */
function drawPlanetTraits(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	planet: PlanetData
): void {
	for (const trait of planet.planet_traits) {
		if (trait === "NoAtmosphere") {
			drawCraters(ctx, x, y, planet.size, planet.color, planet.name);
		} else if (trait === "GoodAtmosphere") {
			drawAtmosphere(ctx, x, y, planet.size);
		}
	}
}

/** Draw an asteroid belt centred at (cx, cy). */
function drawAsteroidBelt(
	ctx: CanvasRenderingContext2D,
	belt: AsteroidData,
	cx: number,
	cy: number,
	time: number
): void {
	const rand = seededRandom(hash(belt.name));
	const rotation = belt.orbitSpeed * time;
	for (let i = 0; i < belt.count; i++) {
		const angle = rand() * Math.PI * 2 + rotation;
		const rOffset = (rand() - 0.5) * 2 * belt.spread;
		const r = belt.orbitRadius + rOffset;
		const size = rand() * 1.5 + 0.8;

		ctx.fillStyle = hexToRgba(belt.color, 0.5 + rand() * 0.4);
		ctx.beginPath();
		ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, size, 0, Math.PI * 2);
		ctx.fill();
	}

	// Belt label at the top of the orbit
	const labelAngle = -Math.PI / 2 + rotation * 0.1;
	ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
	ctx.font = "11px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
	ctx.fillText(
		belt.name,
		cx + Math.cos(labelAngle) * belt.orbitRadius,
		cy + Math.sin(labelAngle) * belt.orbitRadius - belt.spread - 4
	);
}

export function render(
	ctx: CanvasRenderingContext2D,
	planets: PlanetData[],
	asteroids: AsteroidData[],
	moons: Map<string, PlanetData[]>,
	planetAsteroids: Map<string, AsteroidData[]>,
	time: number,
	star: StarData | null
): void {
	const starColor = star?.color ?? STAR_DEFAULTS.color;
	const starRadius = star?.size ?? STAR_DEFAULTS.size;
	const starName = star?.name ?? "Star";

	// Orbit rings for planets
	ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
	ctx.lineWidth = 1;
	for (const planet of planets) {
		ctx.beginPath();
		ctx.arc(0, 0, planet.orbitRadius, 0, Math.PI * 2);
		ctx.stroke();
	}

	// Star-level asteroid belts
	for (const belt of asteroids) {
		drawAsteroidBelt(ctx, belt, 0, 0, time);
	}

	// Star — derive gradient from the star's color
	const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, starRadius);
	gradient.addColorStop(0, "#fff8e1");
	gradient.addColorStop(0.5, starColor);
	gradient.addColorStop(1, darkenColor(starColor, 0.6));
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(0, 0, starRadius, 0, Math.PI * 2);
	ctx.fill();

	// Star glow
	const glowGradient = ctx.createRadialGradient(0, 0, starRadius, 0, 0, starRadius * 2.5);
	glowGradient.addColorStop(0, hexToRgba(starColor, 0.3));
	glowGradient.addColorStop(1, hexToRgba(starColor, 0));
	ctx.fillStyle = glowGradient;
	ctx.beginPath();
	ctx.arc(0, 0, starRadius * 2.5, 0, Math.PI * 2);
	ctx.fill();

	// Star label
	ctx.fillStyle = "#ffffff";
	ctx.font = "bold 14px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	ctx.fillText(starName, 0, starRadius + 6);

	// Planets, their moons, and their asteroid belts
	const positions = computePositions(planets, time);
	for (const pos of positions) {
		const {x, y, planet} = pos;
		const pMoons = moons.get(planet.name);
		const pAsteroids = planetAsteroids.get(planet.name);

		// Moon orbit rings (behind planet)
		if (pMoons) {
			ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
			ctx.lineWidth = 0.5;
			for (const moon of pMoons) {
				ctx.beginPath();
				ctx.arc(x, y, moon.orbitRadius, 0, Math.PI * 2);
				ctx.stroke();
			}
		}

		// Planet-level asteroid belts (behind planet body)
		if (pAsteroids) {
			for (const belt of pAsteroids) {
				drawAsteroidBelt(ctx, belt, x, y, time);
			}
		}

		// Planet body
		ctx.fillStyle = planet.color;
		ctx.beginPath();
		ctx.arc(x, y, planet.size, 0, Math.PI * 2);
		ctx.fill();

		// Trait visual effects (e.g. craters for NoAtmosphere)
		if (planet.planet_traits.length > 0) {
			drawPlanetTraits(ctx, x, y, planet);
		}

		// Planet label
		ctx.fillStyle = "#ffffff";
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(planet.name, x, y + planet.size + 4);

		// Moons
		if (pMoons) {
			const moonPositions = computePositions(pMoons, time);
			for (const mPos of moonPositions) {
				const mx = x + mPos.x;
				const my = y + mPos.y;

				ctx.fillStyle = mPos.planet.color;
				ctx.beginPath();
				ctx.arc(mx, my, mPos.planet.size, 0, Math.PI * 2);
				ctx.fill();

				if (mPos.planet.planet_traits.length > 0) {
					drawPlanetTraits(ctx, mx, my, mPos.planet);
				}

				ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
				ctx.font = "10px sans-serif";
				ctx.textAlign = "center";
				ctx.textBaseline = "top";
				ctx.fillText(mPos.planet.name, mx, my + mPos.planet.size + 2);
			}
		}
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

/** Hit result — a planet, moon, or asteroid belt. */
export type HitResult =
	| {type: "planet"; data: PlanetData}
	| {type: "moon"; data: PlanetData}
	| {type: "asteroid"; data: AsteroidData};

/**
 * Hit-tests in world coordinates (origin at star centre).
 * Checks moons first (smallest targets), then planets, then asteroid belts.
 */
export function hitTest(
	worldX: number,
	worldY: number,
	planets: PlanetData[],
	asteroids: AsteroidData[],
	moons: Map<string, PlanetData[]>,
	planetAsteroids: Map<string, AsteroidData[]>,
	time: number
): HitResult | null {
	const positions = computePositions(planets, time);

	// Moons (check first — smallest targets need priority)
	for (const pos of positions) {
		const planetMoons = moons.get(pos.planet.name);
		if (!planetMoons) continue;
		const moonPositions = computePositions(planetMoons, time);
		for (const mPos of moonPositions) {
			const dx = worldX - (pos.x + mPos.x);
			const dy = worldY - (pos.y + mPos.y);
			const hitRadius = Math.max(mPos.planet.size, 6) + 4;
			if (dx * dx + dy * dy <= hitRadius * hitRadius) {
				return {type: "moon", data: mPos.planet};
			}
		}
	}

	// Planets
	for (const pos of positions) {
		const dx = worldX - pos.x;
		const dy = worldY - pos.y;
		const hitRadius = Math.max(pos.planet.size, 8) + 4;
		if (dx * dx + dy * dy <= hitRadius * hitRadius) {
			return {type: "planet", data: pos.planet};
		}
	}

	// Planet-level asteroid belts
	for (const pos of positions) {
		const pBelts = planetAsteroids.get(pos.planet.name);
		if (!pBelts) continue;
		const relX = worldX - pos.x;
		const relY = worldY - pos.y;
		const dist = Math.sqrt(relX * relX + relY * relY);
		for (const belt of pBelts) {
			if (Math.abs(dist - belt.orbitRadius) <= belt.spread + 4) {
				return {type: "asteroid", data: belt};
			}
		}
	}

	// Star-level asteroid belts
	const dist = Math.sqrt(worldX * worldX + worldY * worldY);
	for (const belt of asteroids) {
		if (Math.abs(dist - belt.orbitRadius) <= belt.spread + 4) {
			return {type: "asteroid", data: belt};
		}
	}

	return null;
}
