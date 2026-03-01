import { Plugin } from 'obsidian';
import { CharacterSheetSettings, DEFAULT_SETTINGS, CharacterSheetSettingTab } from './settings';
import { registerRenderer } from './CharacterSheetRenderer';
import { registerAbilityRenderer } from './AbilityRenderer';
import { CreateCharacterModal } from './CreateCharacterModal';

export default class CharacterSheetPlugin extends Plugin {
	settings: CharacterSheetSettings;

	async onload() {
		await this.loadSettings();

		// Register code block processors
		registerRenderer(this);
		registerAbilityRenderer(this);

		// Ribbon icon for creating a new character
		this.addRibbonIcon('user-plus', 'Create New Character', () => {
			new CreateCharacterModal(this.app, this).open();
		});

		// Command palette: create new character
		this.addCommand({
			id: 'create-character',
			name: 'Create New Character',
			callback: () => {
				new CreateCharacterModal(this.app, this).open();
			},
		});

		// Settings tab
		this.addSettingTab(new CharacterSheetSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<CharacterSheetSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
