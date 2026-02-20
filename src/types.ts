export const VIEW_TYPE_SOLAR_SYSTEM = "solar-system-view";

export interface StarData {
	name: string;
	filePath: string;
	color: string;
	size: number;
	starway: string;
	position: number;
	connectTo?: string;
	connectToStarway?: string;
}

export const STAR_DEFAULTS: Omit<StarData, "name" | "filePath" | "starway"> = {
	color: "#ffeb3b",
	size: 20,
	position: -1
};

export type PlanetTrait = "NoAtmosphere" | "GoodAtmosphere";

export interface PlanetData {
	name: string;
	filePath: string;
	orbitRadius: number;
	size: number;
	color: string;
	orbitSpeed: number;
	startAngle: number;
	planet_traits: PlanetTrait[];
}

export const PLANET_DEFAULTS: Omit<PlanetData, "name" | "filePath"> = {
	orbitRadius: 150,
	size: 12,
	color: "#3498db",
	orbitSpeed: 0.5,
	startAngle: 0,
	planet_traits: [],
};

export const VALID_PLANET_TRAITS: readonly string[] = ["NoAtmosphere", "GoodAtmosphere"];

export interface AsteroidData {
	name: string;
	filePath: string;
	orbitRadius: number;
	color: string;
	orbitSpeed: number;
	count: number;
	spread: number;
}

export const ASTEROID_DEFAULTS: Omit<AsteroidData, "name" | "filePath"> = {
	orbitRadius: 200,
	color: "#8b7355",
	orbitSpeed: 0.1,
	count: 40,
	spread: 15,
};
