import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { SKILLS } from './data';
import type CharacterSheetPlugin from './main';

export class CreateCharacterModal extends Modal {
	private plugin: CharacterSheetPlugin;
	private charName = '';
	private alias = '';
	private occupation = '';

	constructor(app: App, plugin: CharacterSheetPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cs-create-modal');

		contentEl.createEl('h2', { text: 'Create New Character' });

		new Setting(contentEl).setName('Name').setDesc('Character name')
			.addText(t => t.setPlaceholder('Harlan Silver').onChange(v => { this.charName = v; }));

		new Setting(contentEl).setName('Alias').setDesc('Optional title or nickname')
			.addText(t => t.setPlaceholder('The Unreflecting').onChange(v => { this.alias = v; }));

		new Setting(contentEl).setName('Occupation').setDesc('Role or class')
			.addText(t => t.setPlaceholder('Captain').onChange(v => { this.occupation = v; }));

		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('Create').setCta().onClick(() => this.create()))
			.addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	onClose() {
		this.contentEl.empty();
	}

	private async create() {
		if (!this.charName.trim()) {
			new Notice('Character name is required');
			return;
		}

		const prof = this.plugin.settings.defaultProficiency;
		const fileName = this.charName.trim().replace(/[\\/:*?"<>|]/g, '_');
		const filePath = `${fileName}.md`;

		// Check if file already exists
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing) {
			new Notice(`File "${filePath}" already exists`);
			return;
		}

		const skillNames = SKILLS.filter(s => !s.category).map(s => s.name);
		const frontmatter = [
			'---',
			'character_sheet: true',
			`name: "${this.charName.trim()}"`,
			`alias: "${this.alias.trim()}"`,
			`occupation: "${this.occupation.trim()}"`,
			'icon: "shield"',
			`proficiency: ${prof}`,
			'# Attributes',
			'grit: 10',
			'finesse: 10',
			'instinct: 10',
			'acuity: 10',
			'apperception: 10',
			'presence: 10',
			'# Combat',
			'hd: 1',
			'hp: 10',
			'shield: 0',
			'initiative: 0',
			'melee_hit: 0',
			'ranged_hit: 0',
			'# Defenses',
			'melee_avoidance: 8',
			'ranged_avoidance: 8',
			'# Saves & Skills',
			'save_proficiencies: []',
			'proficient_skills: []',
			'skill_overrides: {}',
			'save_overrides: {}',
			'modifier_overrides: {}',
			'# Currency',
			'credits: 0',
			'reliability: 0',
			'# Favors',
			'favors: []',
			'favors_owed: []',
			'---',
		].join('\n');

		const body = [
			'',
			'# Resources',
			'',
			'',
			'# Abilities',
			'',
			'',
			'# Features',
			'',
			'',
		].join('\n');

		const content = frontmatter + '\n' + body;

		const file = await this.app.vault.create(filePath, content);
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);

		new Notice(`Created character: ${this.charName}`);
		this.close();
	}
}
