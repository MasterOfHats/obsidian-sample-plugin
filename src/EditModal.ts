import { App, Modal, Setting, TFile } from 'obsidian';
import { CharacterSheet, AttributeName, SaveName } from './types';
import { ATTRIBUTES, SAVES, SKILLS } from './data';
import type CharacterSheetPlugin from './main';

export type EditSection = 'identity' | 'attributes' | 'combat' | 'defenses' | 'skills' | 'currency';

export class EditModal extends Modal {
	private plugin: CharacterSheetPlugin;
	private file: TFile;
	private sheet: CharacterSheet;
	private section: EditSection;

	constructor(app: App, plugin: CharacterSheetPlugin, file: TFile, sheet: CharacterSheet, section: EditSection) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.sheet = { ...sheet };
		this.section = section;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cs-edit-modal');

		switch (this.section) {
			case 'identity': this.renderIdentity(contentEl); break;
			case 'attributes': this.renderAttributes(contentEl); break;
			case 'combat': this.renderCombat(contentEl); break;
			case 'defenses': this.renderDefenses(contentEl); break;
			case 'skills': this.renderSkills(contentEl); break;
			case 'currency': this.renderCurrency(contentEl); break;
		}

		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('Save').setCta().onClick(() => this.save()))
			.addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	onClose() {
		this.contentEl.empty();
	}

	private renderIdentity(el: HTMLElement) {
		el.createEl('h2', { text: 'Edit Identity' });

		new Setting(el).setName('Name')
			.addText(t => t.setValue(this.sheet.name).onChange(v => { this.sheet.name = v; }));
		new Setting(el).setName('Alias')
			.addText(t => t.setValue(this.sheet.alias).onChange(v => { this.sheet.alias = v; }));
		new Setting(el).setName('Occupation')
			.addText(t => t.setValue(this.sheet.occupation).onChange(v => { this.sheet.occupation = v; }));
		new Setting(el).setName('Icon')
			.addText(t => t.setValue(this.sheet.icon).onChange(v => { this.sheet.icon = v; }));
		new Setting(el).setName('Proficiency')
			.addText(t => t.setValue(String(this.sheet.proficiency))
				.onChange(v => { this.sheet.proficiency = parseInt(v) || 0; }));
	}

	private renderAttributes(el: HTMLElement) {
		el.createEl('h2', { text: 'Edit Attributes' });

		for (const attr of ATTRIBUTES) {
			new Setting(el).setName(attr.label)
				.addText(t => t.setValue(String(this.sheet[attr.name]))
					.onChange(v => {
						(this.sheet as unknown as Record<string, unknown>)[attr.name] = parseInt(v) || 0;
					}));
		}
	}

	private renderCombat(el: HTMLElement) {
		el.createEl('h2', { text: 'Edit Combat' });

		const fields: { key: keyof CharacterSheet; label: string }[] = [
			{ key: 'hd', label: 'Hit Dice' },
			{ key: 'hp', label: 'Hit Points' },
			{ key: 'shield', label: 'Shield' },
			{ key: 'initiative', label: 'Initiative' },
			{ key: 'melee_hit', label: 'Melee Hit' },
			{ key: 'ranged_hit', label: 'Ranged Hit' },
		];

		for (const field of fields) {
			new Setting(el).setName(field.label)
				.addText(t => t.setValue(String(this.sheet[field.key]))
					.onChange(v => {
						(this.sheet as unknown as Record<string, unknown>)[field.key] = parseInt(v) || 0;
					}));
		}
	}

	private renderDefenses(el: HTMLElement) {
		el.createEl('h2', { text: 'Edit Defenses & Saves' });

		new Setting(el).setName('Melee Avoidance')
			.addText(t => t.setValue(String(this.sheet.melee_avoidance))
				.onChange(v => { this.sheet.melee_avoidance = parseInt(v) || 0; }));
		new Setting(el).setName('Ranged Avoidance')
			.addText(t => t.setValue(String(this.sheet.ranged_avoidance))
				.onChange(v => { this.sheet.ranged_avoidance = parseInt(v) || 0; }));

		el.createEl('h3', { text: 'Save Proficiencies' });
		const saveProficiencies = new Set(this.sheet.save_proficiencies ?? []);

		for (const save of SAVES) {
			new Setting(el).setName(save.label)
				.addToggle(t => t.setValue(saveProficiencies.has(save.name))
					.onChange(v => {
						if (v) saveProficiencies.add(save.name);
						else saveProficiencies.delete(save.name);
						this.sheet.save_proficiencies = Array.from(saveProficiencies) as SaveName[];
					}));
		}
	}

	private renderSkills(el: HTMLElement) {
		el.createEl('h2', { text: 'Edit Skill Proficiencies' });

		const proficient = new Set(this.sheet.proficient_skills ?? []);

		for (const skill of SKILLS) {
			new Setting(el).setName(`${skill.label} (${skill.attribute.slice(0, 3).toUpperCase()})`)
				.addToggle(t => t.setValue(proficient.has(skill.name))
					.onChange(v => {
						if (v) proficient.add(skill.name);
						else proficient.delete(skill.name);
						this.sheet.proficient_skills = Array.from(proficient);
					}));
		}
	}

	private renderCurrency(el: HTMLElement) {
		el.createEl('h2', { text: 'Edit Currency & Favors' });

		new Setting(el).setName('Credits')
			.addText(t => t.setValue(String(this.sheet.credits))
				.onChange(v => { this.sheet.credits = parseInt(v) || 0; }));
		new Setting(el).setName('Reliability')
			.addText(t => t.setValue(String(this.sheet.reliability))
				.onChange(v => { this.sheet.reliability = parseInt(v) || 0; }));

		el.createEl('h3', { text: 'Favors Held (one per line)' });
		const favorsArea = el.createEl('textarea', { cls: 'cs-textarea' });
		favorsArea.value = (this.sheet.favors ?? []).join('\n');
		favorsArea.rows = 4;
		favorsArea.addEventListener('input', () => {
			this.sheet.favors = favorsArea.value.split('\n').filter(l => l.trim());
		});

		el.createEl('h3', { text: 'Favors Owed (one per line)' });
		const owedArea = el.createEl('textarea', { cls: 'cs-textarea' });
		owedArea.value = (this.sheet.favors_owed ?? []).join('\n');
		owedArea.rows = 4;
		owedArea.addEventListener('input', () => {
			this.sheet.favors_owed = owedArea.value.split('\n').filter(l => l.trim());
		});
	}

	private async save() {
		await this.app.fileManager.processFrontMatter(this.file, (fm) => {
			switch (this.section) {
				case 'identity':
					fm.name = this.sheet.name;
					fm.alias = this.sheet.alias;
					fm.occupation = this.sheet.occupation;
					fm.icon = this.sheet.icon;
					fm.proficiency = this.sheet.proficiency;
					break;
				case 'attributes':
					for (const attr of ATTRIBUTES) {
						fm[attr.name] = this.sheet[attr.name];
					}
					break;
				case 'combat':
					fm.hd = this.sheet.hd;
					fm.hp = this.sheet.hp;
					fm.shield = this.sheet.shield;
					fm.initiative = this.sheet.initiative;
					fm.melee_hit = this.sheet.melee_hit;
					fm.ranged_hit = this.sheet.ranged_hit;
					break;
				case 'defenses':
					fm.melee_avoidance = this.sheet.melee_avoidance;
					fm.ranged_avoidance = this.sheet.ranged_avoidance;
					fm.save_proficiencies = this.sheet.save_proficiencies;
					break;
				case 'skills':
					fm.proficient_skills = this.sheet.proficient_skills;
					break;
				case 'currency':
					fm.credits = this.sheet.credits;
					fm.reliability = this.sheet.reliability;
					fm.favors = this.sheet.favors;
					fm.favors_owed = this.sheet.favors_owed;
					break;
			}
		});
		this.close();
	}
}
