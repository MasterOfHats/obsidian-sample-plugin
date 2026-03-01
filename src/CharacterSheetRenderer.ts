import { MarkdownPostProcessorContext, TFile } from 'obsidian';
import { CharacterSheet } from './types';
import {
	ATTRIBUTES, SAVES, SKILLS,
	getEffectiveModifier, calculateSkillBonus, calculateSaveBonus,
	formatModifier, parseCharacterSheet,
} from './data';
import { EditModal, EditSection } from './EditModal';
import { DiceRollerModal } from './DiceRollerModal';
import { AbilityBlock, extractAbilities, renderDescription } from './AbilityRenderer';
import type CharacterSheetPlugin from './main';

export function registerRenderer(plugin: CharacterSheetPlugin) {
	// Usage:
	//   ```cs
	//   self
	//   ```
	//   Renders the current note's frontmatter as a character sheet.
	//
	//   ```cs
	//   Harlan Silver
	//   ```
	//   Renders the character sheet from the note named "Harlan Silver".

	plugin.registerMarkdownCodeBlockProcessor('cs', (source, el, ctx) => {
		const target = source.trim();

		let file: TFile | null;
		if (!target || target.toLowerCase() === 'self') {
			// Resolve the file the code block lives in
			const abstract = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
			file = abstract instanceof TFile ? abstract : null;
		} else {
			// Find a note by name (with or without .md extension)
			file = resolveFile(plugin, target);
		}

		if (!file) {
			el.createDiv({ cls: 'cs-error', text: `Character sheet not found: "${target}"` });
			return;
		}

		const cache = plugin.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm || fm.character_sheet !== true) {
			el.createDiv({
				cls: 'cs-error',
				text: `"${file.basename}" is not a character sheet (missing character_sheet: true in frontmatter)`,
			});
			return;
		}

		const sheet = parseCharacterSheet(fm);
		if (!sheet) {
			el.createDiv({ cls: 'cs-error', text: `Failed to parse character sheet from "${file.basename}"` });
			return;
		}

		const wrapper = el.createDiv({ cls: 'cs-sheet' });
		void renderSheet(wrapper, sheet, plugin, file);
	});
}

function resolveFile(plugin: CharacterSheetPlugin, name: string): TFile | null {
	// Try exact path first
	const byPath = plugin.app.vault.getAbstractFileByPath(name);
	if (byPath instanceof TFile) return byPath;

	// Try with .md extension
	const withMd = plugin.app.vault.getAbstractFileByPath(name + '.md');
	if (withMd instanceof TFile) return withMd;

	// Search all markdown files by basename
	const allFiles = plugin.app.vault.getMarkdownFiles();
	const match = allFiles.find(f => f.basename.toLowerCase() === name.toLowerCase());
	return match ?? null;
}

async function renderSheet(root: HTMLElement, sheet: CharacterSheet, plugin: CharacterSheetPlugin, file: TFile) {
	renderIdentity(root, sheet, plugin, file);

	const columns = root.createDiv({ cls: 'cs-columns' });
	const leftCol = columns.createDiv({ cls: 'cs-col cs-col-left' });
	const rightCol = columns.createDiv({ cls: 'cs-col cs-col-right' });

	renderAttributes(leftCol, sheet, plugin, file);
	renderDefenses(leftCol, sheet, plugin, file);
	renderCombat(leftCol, sheet, plugin, file);

	renderSkills(rightCol, sheet, plugin, file);
	renderCurrency(rightCol, sheet, plugin, file);

	// Extract and render abilities from the note content
	const content = await plugin.app.vault.cachedRead(file);
	const abilities = extractAbilities(content);
	if (abilities.length > 0) {
		renderAbilities(root, abilities, plugin);
	}
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

	const meleeAv = grid.createDiv({ cls: 'cs-defense-item' });
	meleeAv.createDiv({ cls: 'cs-defense-label', text: 'Melee Avoidance' });
	meleeAv.createDiv({ cls: 'cs-defense-value', text: String(sheet.melee_avoidance) });

	const rangedAv = grid.createDiv({ cls: 'cs-defense-item' });
	rangedAv.createDiv({ cls: 'cs-defense-label', text: 'Ranged Avoidance' });
	rangedAv.createDiv({ cls: 'cs-defense-value', text: String(sheet.ranged_avoidance) });

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

function renderAbilities(root: HTMLElement, abilities: AbilityBlock[], plugin: CharacterSheetPlugin) {
	const active = abilities.filter(a => a.action.toLowerCase() !== 'passive');
	const passive = abilities.filter(a => a.action.toLowerCase() === 'passive');

	if (active.length > 0) {
		renderAbilityGroup(root, 'Abilities', active, plugin);
	}
	if (passive.length > 0) {
		renderAbilityGroup(root, 'Features', passive, plugin);
	}
}

function renderAbilityGroup(root: HTMLElement, title: string, abilities: AbilityBlock[], plugin: CharacterSheetPlugin) {
	const section = root.createDiv({ cls: 'cs-section cs-abilities-section' });
	const header = section.createDiv({ cls: 'cs-section-header' });
	header.createSpan({ text: title, cls: 'cs-section-title' });

	const grid = section.createDiv({ cls: 'cs-abilities-grid' });

	for (const ability of abilities) {
		const item = grid.createDiv({ cls: 'cs-abilities-item' });

		// Compact display: name + action pills
		item.createSpan({ cls: 'cs-abilities-item-name', text: ability.name });
		if (ability.action) {
			const actions = ability.action.split(',').map(a => a.trim()).filter(a => a);
			for (const action of actions) {
				item.createSpan({ cls: 'cs-abilities-item-action', text: action });
			}
		}

		// Tooltip on hover
		const tooltip = item.createDiv({ cls: 'cs-abilities-tooltip' });

		// Tooltip header
		const tipHeader = tooltip.createDiv({ cls: 'cs-ability-header' });
		const nameGroup = tipHeader.createDiv({ cls: 'cs-ability-name-group' });
		nameGroup.createSpan({ cls: 'cs-ability-name', text: ability.name });
		if (ability.action) {
			const actions = ability.action.split(',').map(a => a.trim()).filter(a => a);
			for (const action of actions) {
				nameGroup.createSpan({ cls: 'cs-ability-action', text: action });
			}
		}
		const tipTags = tipHeader.createDiv({ cls: 'cs-ability-tags' });
		if (ability.cost) {
			tipTags.createSpan({ cls: 'cs-ability-cost', text: ability.cost });
		}

		if (ability.target) {
			const targetRow = tooltip.createDiv({ cls: 'cs-ability-target-row' });
			targetRow.createSpan({ cls: 'cs-ability-target-label', text: 'Target' });
			targetRow.createSpan({ cls: 'cs-ability-target', text: ability.target });
		}

		if (ability.description) {
			renderDescription(tooltip, ability.description, plugin);
		}

		if (ability.notes.length > 0) {
			const notesEl = tooltip.createDiv({ cls: 'cs-ability-notes' });
			for (const note of ability.notes) {
				const noteItem = notesEl.createDiv({ cls: 'cs-ability-note' });
				noteItem.createSpan({ cls: 'cs-ability-note-icon', text: '\u26A0' });
				noteItem.createSpan({ cls: 'cs-ability-note-text', text: note });
			}
		}
	}
}
