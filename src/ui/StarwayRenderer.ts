import {StarData} from "../types";

interface StarPosition {
	x: number;
	y: number;
	star: StarData;
}

/** Simple deterministic hash for a string, returns an integer. */
function hash(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (h * 31 + s.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

/** Seeded pseudo-random number generator (xorshift32). */
function seededRandom(seed: number): () => number {
	let s = seed | 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >> 17;
		s ^= s << 5;
		return (s >>> 0) / 0xFFFFFFFF;
	};
}

function computeStarPositions(
	width: number,
	height: number,
	stars: StarData[]
): StarPosition[] {
	const cx = width / 2;
	const cy = height / 2;
	const margin = 80;
	const radius = Math.min(cx, cy) - margin;

	if (stars.length === 0) return [];
	if (stars.length === 1) {
		return [{x: cx, y: cy, star: stars[0]!}];
	}

	return stars.map((star, i) => {
		const angle = (i / stars.length) * Math.PI * 2 - Math.PI / 2;
		const h = hash(star.name);
		const rVariation = 0.55 + (h % 45) / 100; // 0.55 – 1.0
		const r = radius * rVariation;
		return {
			x: cx + Math.cos(angle) * r,
			y: cy + Math.sin(angle) * r,
			star,
		};
	});
}

export function renderStarway(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	stars: StarData[],
	time: number,
	starwayName: string
): void {
	ctx.clearRect(0, 0, width, height);

	// Background star dots
	const rand = seededRandom(hash(starwayName));
	ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
	for (let i = 0; i < 120; i++) {
		const sx = rand() * width;
		const sy = rand() * height;
		const sr = rand() * 1.2 + 0.3;
		ctx.beginPath();
		ctx.arc(sx, sy, sr, 0, Math.PI * 2);
		ctx.fill();
	}

	const positions = computeStarPositions(width, height, stars);

	// Constellation lines
	if (positions.length > 1) {
		ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(positions[0]!.x, positions[0]!.y);
		for (let i = 1; i < positions.length; i++) {
			ctx.lineTo(positions[i]!.x, positions[i]!.y);
		}
		ctx.stroke();
	}

	// Stars
	for (const pos of positions) {
		const {x, y, star} = pos;
		const r = Math.max(star.size * 0.4, 6);

		// Glow
		const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3);
		glow.addColorStop(0, hexToRgba(star.color, 0.35));
		glow.addColorStop(1, hexToRgba(star.color, 0));
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(x, y, r * 3, 0, Math.PI * 2);
		ctx.fill();

		// Twinkle – subtle size oscillation
		const twinkle = 1 + 0.08 * Math.sin(time * 2 + hash(star.name));
		const drawR = r * twinkle;

		// Body
		const grad = ctx.createRadialGradient(x, y, 0, x, y, drawR);
		grad.addColorStop(0, "#ffffff");
		grad.addColorStop(0.5, star.color);
		grad.addColorStop(1, hexToRgba(star.color, 0.6));
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(x, y, drawR, 0, Math.PI * 2);
		ctx.fill();

		// Label
		ctx.fillStyle = "#ffffff";
		ctx.font = "12px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(star.name, x, y + drawR + 6);
	}

	// Title
	ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
	ctx.font = "bold 16px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
	ctx.fillText(starwayName, width / 2, height - 16);
}

export function starwayHitTest(
	x: number,
	y: number,
	width: number,
	height: number,
	stars: StarData[]
): StarData | null {
	const positions = computeStarPositions(width, height, stars);
	for (const pos of positions) {
		const dx = x - pos.x;
		const dy = y - pos.y;
		const hitRadius = Math.max(pos.star.size * 0.4, 6) + 6;
		if (dx * dx + dy * dy <= hitRadius * hitRadius) {
			return pos.star;
		}
	}
	return null;
}

function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
