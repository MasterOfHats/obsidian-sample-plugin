export type AttributeName = 'grit' | 'finesse' | 'instinct' | 'acuity' | 'apperception' | 'presence';
export type SaveName = 'resilience' | 'reflexes' | 'willpower';

export interface CharacterSheet {
	character_sheet: true;
	name: string;
	alias: string;
	occupation: string;
	icon: string;
	proficiency: number;

	// Attributes
	grit: number;
	finesse: number;
	instinct: number;
	acuity: number;
	apperception: number;
	presence: number;

	// Combat
	hd: number;
	hp: number;
	shield: number;
	initiative: number;
	melee_hit: number;
	ranged_hit: number;

	// Defenses
	melee_avoidance: number;
	ranged_avoidance: number;

	// Saves & Skills
	save_proficiencies: SaveName[];
	proficient_skills: string[];
	skill_overrides: Record<string, number>;
	save_overrides: Record<string, number>;
	modifier_overrides: Record<string, number>;

	// Currency
	credits: number;
	reliability: number;

	// Favors
	favors: string[];
	favors_owed: string[];
}

export const DEFAULT_CHARACTER: CharacterSheet = {
	character_sheet: true,
	name: '',
	alias: '',
	occupation: '',
	icon: 'shield',
	proficiency: 2,
	grit: 10,
	finesse: 10,
	instinct: 10,
	acuity: 10,
	apperception: 10,
	presence: 10,
	hd: 1,
	hp: 10,
	shield: 0,
	initiative: 0,
	melee_hit: 0,
	ranged_hit: 0,
	melee_avoidance: 8,
	ranged_avoidance: 8,
	save_proficiencies: [],
	proficient_skills: [],
	skill_overrides: {},
	save_overrides: {},
	modifier_overrides: {},
	credits: 0,
	reliability: 0,
	favors: [],
	favors_owed: [],
};
