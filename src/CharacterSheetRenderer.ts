import { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { CharacterSheet } from './types';
import {
	ATTRIBUTES, SAVES, SKILLS,
	calculateModifier, getEffectiveModifier, calculateSkillBonus, calculateSaveBonus,
	formatModifier, parseCharacterSheet,
} from './data';
import { EditModal, EditSection } from './EditModal';
import { DiceRollerModal } from './DiceRollerModal';
import type CharacterSheetPlugin from './main';

export function registerRenderer(plugin: CharacterSheetPlugin) {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;

		const cache = plugin.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm || fm.character_sheet !== true) return;

		// The post-processor fires once per rendered SECTION (block),
		// not once per note. We only want one character sheet per note.
		// Check the parent preview container for an existing sheet to
		// prevent duplicates.
		const previewContainer = el.closest('.markdown-preview-view');
		if (previewContainer?.querySelector('.cs-sheet')) return;

		const sheet = parseCharacterSheet(fm);
		if (!sheet) return;

		const wrapper = el.createDiv({ cls: 'cs-sheet' });
		el.prepend(wrapper);

		renderSheet(wrapper, sheet, plugin, file);
	});
}

function renderSheet(root: HTMLElement, sheet: CharacterSheet, plugin: CharacterSheetPlugin, file: TFile) {
	// Identity Bar
	renderIdentity(root, sheet, plugin, file);

	const columns = root.createDiv({ cls: 'cs-columns' });
	const leftCol = columns.createDiv({ cls: 'cs-col cs-col-left' });
	const rightCol = columns.createDiv({ cls: 'cs-col cs-col-right' });

	// Left column: Attributes, Defenses, Combat
	renderAttributes(leftCol, sheet, plugin, file);
	renderDefenses(leftCol, sheet, plugin, file);
	renderCombat(leftCol, sheet, plugin, file);

	// Right column: Skills, Currency & Favors
	renderSkills(rightCol, sheet, plugin, file);
	renderCurrency(rightCol, sheet, plugin, file);
}

function sectionHeader(parent: HTMLElement, title: string, onClick: () => void): HTMLElement {
	const header = parent.createDiv({ cls: 'cs-section-header' });
	header.createSpan({ text: title, cls: 'cs-section-title' });
	const editBtn = header.createSpan({ text: '\u270E', cls: 'cs-edit-btn' });
	editBtn.setAttribute('aria-label', `Edit ${title}`);
	editBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		onClick();
	});
	return header;
}

function openEdit(plugin: CharacterSheetPlugin, file: TFile, sheet: CharacterSheet, section: EditSection) {
	new EditModal(plugin.app, plugin, file, sheet, section).open();
}

function renderIdentity(root: HTMLElement, sheet: CharacterSheet, plugin: CharacterSheetPlugin, file: TFile) {
	const section = root.createDiv({ cls: 'cs-identity' });
	sectionHeader(section, 'Identity', () => openEdit(plugin, file, sheet, 'identity'));

	const body = section.createDiv({ cls: 'cs-identity-body' });
	body.createDiv({ cls: 'cs-name', text: sheet.name || 'Unnamed' });

	const details = body.createDiv({ cls: 'cs-identity-details' });
	if (sheet.alias) {
		details.createSpan({ cls: 'cs-alias', text: `"${sheet.alias}"` });
	}
	if (sheet.occupation) {
		details.createSpan({ cls: 'cs-occupation', text: sheet.occupation });
	}
	details.createSpan({ cls: 'cs-proficiency', text: `Prof +${sheet.proficiency}` });
}

function renderAttributes(parent: HTMLElement, sheet: CharacterSheet, plugin: CharacterSheetPlugin, file: TFile) {
	const section = parent.createDiv({ cls: 'cs-section cs-attributes' });
	sectionHeader(section, 'Attributes', () => openEdit(plugin, file, sheet, 'attributes'));

	const grid = section.createDiv({ cls: 'cs-attr-grid' });
	for (const attr of ATTRIBUTES) {
		const value = sheet[attr.name] as number;
		const mod = getEffectiveModifier(sheet, attr.name);

		const cell = grid.createDiv({ cls: 'cs-attr-cell' });
		cell.createDiv({ cls: 'cs-attr-label', text: attr.label });
		cell.createDiv({ cls: 'cs-attr-value', text: String(value) });
		cell.createDiv({ cls: 'cs-attr-mod', text: formatModifier(mod) });
	}
}

function renderDefenses(parent: HTMLElement, sheet: CharacterSheet, plugin: CharacterSheetPlugin, file: TFile) {
	const section = parent.createDiv({ cls: 'cs-section cs-defenses' });
	sectionHeader(section, 'Defenses & Saves', () => openEdit(plugin, file, sheet, 'defenses'));

	const grid = section.createDiv({ cls: 'cs-defense-grid' });

	// Avoidances
	const meleeAv = grid.createDiv({ cls: 'cs-defense-item' });
	meleeAv.createDiv({ cls: 'cs-defense-label', text: 'Melee Avoidance' });
	meleeAv.createDiv({ cls: 'cs-defense-value', text: String(sheet.melee_avoidance) });

	const rangedAv = grid.createDiv({ cls: 'cs-defense-item' });
	rangedAv.createDiv({ cls: 'cs-defense-label', text: 'Ranged Avoidance' });
	rangedAv.createDiv({ cls: 'cs-defense-value', text: String(sheet.ranged_avoidance) });

	// Saves
	const savesContainer = section.createDiv({ cls: 'cs-saves' });
	for (const save of SAVES) {
		const bonus = calculateSaveBonus(sheet, save.name);
		const isProficient = (sheet.save_proficiencies ?? []).includes(save.name);

		const saveEl = savesContainer.createDiv({
			cls: `cs-save-item ${isProficient ? 'cs-proficient' : ''}`,
		});
		saveEl.createDiv({ cls: 'cs-save-label', text: save.label });
		saveEl.createDiv({ cls: 'cs-save-value', text: formatModifier(bonus) });

		saveEl.addEventListener('click', () => {
			new DiceRollerModal(plugin.app, `${save.label} Save`, bonus).open();
		});
		saveEl.addClass('cs-clickable');
	}
}

function renderCombat(parent: HTMLElement, sheet: CharacterSheet, plugin: CharacterSheetPlugin, file: TFile) {
	const section = parent.createDiv({ cls: 'cs-section cs-combat' });
	sectionHeader(section, 'Combat', () => openEdit(plugin, file, sheet, 'combat'));

	const grid = section.createDiv({ cls: 'cs-combat-grid' });

	const stats: [string, string | number][] = [
		['HD', sheet.hd],
		['HP', sheet.hp],
		['Shield', sheet.shield],
		['Initiative', formatModifier(sheet.initiative)],
		['Melee Hit', formatModifier(sheet.melee_hit)],
		['Ranged Hit', formatModifier(sheet.ranged_hit)],
	];

	for (const [label, value] of stats) {
		const cell = grid.createDiv({ cls: 'cs-combat-item' });
		cell.createDiv({ cls: 'cs-combat-label', text: label });
		cell.createDiv({ cls: 'cs-combat-value', text: String(value) });
	}
}

function renderSkills(parent: HTMLElement, sheet: CharacterSheet, plugin: CharacterSheetPlugin, file: TFile) {
	const section = parent.createDiv({ cls: 'cs-section cs-skills' });
	sectionHeader(section, 'Skills', () => openEdit(plugin, file, sheet, 'skills'));

	const table = section.createDiv({ cls: 'cs-skill-table' });

	// Group: personal skills first, then ship
	const personalSkills = SKILLS.filter(s => !s.category);
	const shipSkills = SKILLS.filter(s => s.category === 'Ship');

	renderSkillGroup(table, personalSkills, sheet, plugin);

	if (shipSkills.length > 0) {
		table.createDiv({ cls: 'cs-skill-category', text: 'Ship' });
		renderSkillGroup(table, shipSkills, sheet, plugin);
	}
}

function renderSkillGroup(
	table: HTMLElement,
	skills: typeof SKILLS,
	sheet: CharacterSheet,
	plugin: CharacterSheetPlugin,
) {
	for (const skill of skills) {
		const bonus = calculateSkillBonus(sheet, skill.name);
		const isProficient = (sheet.proficient_skills ?? []).includes(skill.name);

		const row = table.createDiv({
			cls: `cs-skill-row ${isProficient ? 'cs-proficient' : ''}`,
		});

		const profDot = row.createSpan({ cls: 'cs-prof-dot' });
		profDot.setText(isProficient ? '\u25CF' : '\u25CB');

		row.createSpan({ cls: 'cs-skill-name', text: skill.label });
		row.createSpan({
			cls: 'cs-skill-attr',
			text: skill.attribute.slice(0, 3).toUpperCase(),
		});
		row.createSpan({ cls: 'cs-skill-bonus', text: formatModifier(bonus) });

		row.addClass('cs-clickable');
		row.addEventListener('click', () => {
			new DiceRollerModal(plugin.app, skill.label, bonus).open();
		});
	}
}

function renderCurrency(parent: HTMLElement, sheet: CharacterSheet, plugin: CharacterSheetPlugin, file: TFile) {
	const section = parent.createDiv({ cls: 'cs-section cs-currency' });
	sectionHeader(section, 'Currency & Favors', () => openEdit(plugin, file, sheet, 'currency'));

	const grid = section.createDiv({ cls: 'cs-currency-grid' });

	const credits = grid.createDiv({ cls: 'cs-currency-item' });
	credits.createDiv({ cls: 'cs-currency-label', text: 'Credits' });
	credits.createDiv({ cls: 'cs-currency-value', text: sheet.credits.toLocaleString() });

	const reliability = grid.createDiv({ cls: 'cs-currency-item' });
	reliability.createDiv({ cls: 'cs-currency-label', text: 'Reliability' });
	reliability.createDiv({ cls: 'cs-currency-value', text: String(sheet.reliability) });

	// Favors
	const favors = sheet.favors ?? [];
	const favorsOwed = sheet.favors_owed ?? [];

	if (favors.length > 0) {
		const favSection = section.createDiv({ cls: 'cs-favors' });
		favSection.createDiv({ cls: 'cs-favors-label', text: 'Favors Held' });
		const list = favSection.createEl('ul', { cls: 'cs-favors-list' });
		for (const f of favors) {
			list.createEl('li', { text: f });
		}
	}

	if (favorsOwed.length > 0) {
		const owedSection = section.createDiv({ cls: 'cs-favors' });
		owedSection.createDiv({ cls: 'cs-favors-label', text: 'Favors Owed' });
		const list = owedSection.createEl('ul', { cls: 'cs-favors-list' });
		for (const f of favorsOwed) {
			list.createEl('li', { text: f });
		}
	}
}
