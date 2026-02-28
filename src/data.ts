import { AttributeName, CharacterSheet, SaveName } from './types';

// Modifier lookup thresholds (value → modifier)
const MODIFIER_TABLE: [number, number][] = [
	[8,  -1],
	[10,  0],
	[12,  1],
	[14,  2],
	[16,  3],
	[19,  4],
	[22,  5],
	[25,  6],
	[29,  7],
	[33,  8],
	[37,  9],
	[42, 10],
	[47, 11],
	[52, 12],
	[58, 13],
	[64, 14],
	[70, 15],
];

export function calculateModifier(value: number): number {
	// Values below 8 get -1
	let mod = -1;
	for (const [threshold, m] of MODIFIER_TABLE) {
		if (value >= threshold) {
			mod = m;
		} else {
			break;
		}
	}
	return mod;
}

export function getEffectiveModifier(sheet: CharacterSheet, attr: AttributeName): number {
	const overrides = sheet.modifier_overrides ?? {};
	if (attr in overrides) {
		return overrides[attr]!;
	}
	return calculateModifier(sheet[attr]);
}

export const ATTRIBUTES: { name: AttributeName; label: string }[] = [
	{ name: 'grit', label: 'Grit' },
	{ name: 'finesse', label: 'Finesse' },
	{ name: 'instinct', label: 'Instinct' },
	{ name: 'acuity', label: 'Acuity' },
	{ name: 'apperception', label: 'Apperception' },
	{ name: 'presence', label: 'Presence' },
];

export const SAVES: { name: SaveName; label: string; attribute: AttributeName }[] = [
	{ name: 'resilience', label: 'Resilience', attribute: 'grit' },
	{ name: 'reflexes', label: 'Reflexes', attribute: 'finesse' },
	{ name: 'willpower', label: 'Willpower', attribute: 'apperception' },
];

export interface SkillDef {
	name: string;
	label: string;
	attribute: AttributeName;
	category?: string;
}

export const SKILLS: SkillDef[] = [
	// Grit
	{ name: 'athletics', label: 'Athletics', attribute: 'grit' },
	{ name: 'focus', label: 'Focus', attribute: 'grit' },
	// Finesse
	{ name: 'acrobatics', label: 'Acrobatics', attribute: 'finesse' },
	{ name: 'sleight of hand', label: 'Sleight of Hand', attribute: 'finesse' },
	{ name: 'stealth', label: 'Stealth', attribute: 'finesse' },
	// Instinct
	{ name: 'chemistry', label: 'Chemistry', attribute: 'instinct' },
	{ name: 'cooking', label: 'Cooking', attribute: 'instinct' },
	{ name: 'dream', label: 'Dream', attribute: 'instinct' },
	{ name: 'first contact', label: 'First Contact', attribute: 'instinct' },
	{ name: 'insight', label: 'Insight', attribute: 'instinct' },
	{ name: 'survival', label: 'Survival', attribute: 'instinct' },
	// Acuity
	{ name: 'investigation', label: 'Investigation', attribute: 'acuity' },
	{ name: 'maintenance', label: 'Maintenance', attribute: 'acuity' },
	{ name: 'senses', label: 'Senses', attribute: 'acuity' },
	// Apperception
	{ name: 'biology', label: 'Biology', attribute: 'apperception' },
	{ name: 'engineering', label: 'Engineering', attribute: 'apperception' },
	{ name: 'geology', label: 'Geology', attribute: 'apperception' },
	{ name: 'history', label: 'History', attribute: 'apperception' },
	{ name: 'medicine', label: 'Medicine', attribute: 'apperception' },
	{ name: 'politics', label: 'Politics', attribute: 'apperception' },
	// Presence
	{ name: 'deception', label: 'Deception', attribute: 'presence' },
	{ name: 'intimidation', label: 'Intimidation', attribute: 'presence' },
	{ name: 'persuasion', label: 'Persuasion', attribute: 'presence' },
	{ name: 'perform', label: 'Perform', attribute: 'presence' },
	// Ship skills
	{ name: 'piloting', label: 'Piloting', attribute: 'finesse', category: 'Ship' },
	{ name: 'gunning', label: 'Gunning', attribute: 'acuity', category: 'Ship' },
	{ name: 'jumping', label: 'Jumping', attribute: 'instinct', category: 'Ship' },
	{ name: 'direct', label: 'Direct', attribute: 'presence', category: 'Ship' },
	{ name: 'tools', label: 'Tools', attribute: 'apperception', category: 'Ship' },
];

export function calculateSkillBonus(sheet: CharacterSheet, skillName: string): number {
	const overrides = sheet.skill_overrides ?? {};
	if (skillName in overrides) {
		return overrides[skillName]!;
	}

	const skillDef = SKILLS.find(s => s.name === skillName);
	if (!skillDef) return 0;

	const attrMod = getEffectiveModifier(sheet, skillDef.attribute);
	const proficiencies = sheet.proficient_skills ?? [];
	const isProficient = proficiencies.includes(skillName);

	return attrMod + (isProficient ? (sheet.proficiency ?? 0) : 0);
}

export function calculateSaveBonus(sheet: CharacterSheet, saveName: SaveName): number {
	const overrides = sheet.save_overrides ?? {};
	if (saveName in overrides) {
		return overrides[saveName]!;
	}

	const saveDef = SAVES.find(s => s.name === saveName);
	if (!saveDef) return 0;

	const attrMod = getEffectiveModifier(sheet, saveDef.attribute);
	const proficiencies = sheet.save_proficiencies ?? [];
	const isProficient = proficiencies.includes(saveName);

	return attrMod + (isProficient ? (sheet.proficiency ?? 0) : 0);
}

export function parseCharacterSheet(frontmatter: Record<string, unknown>): CharacterSheet | null {
	if (!frontmatter || frontmatter.character_sheet !== true) return null;

	const defaults = {
		character_sheet: true as const,
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
		save_proficiencies: [] as string[],
		proficient_skills: [] as string[],
		skill_overrides: {} as Record<string, number>,
		save_overrides: {} as Record<string, number>,
		modifier_overrides: {} as Record<string, number>,
		credits: 0,
		reliability: 0,
		favors: [] as string[],
		favors_owed: [] as string[],
	};

	return { ...defaults, ...frontmatter } as CharacterSheet;
}

export function formatModifier(mod: number): string {
	return mod >= 0 ? `+${mod}` : `${mod}`;
}
