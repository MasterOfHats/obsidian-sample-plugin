import { App, PluginSettingTab, Setting } from 'obsidian';
import type CharacterSheetPlugin from './main';

export interface CharacterSheetSettings {
	defaultProficiency: number;
	autoCalculate: boolean;
	diceNotificationDuration: number;
}

export const DEFAULT_SETTINGS: CharacterSheetSettings = {
	defaultProficiency: 2,
	autoCalculate: true,
	diceNotificationDuration: 5000,
};

export class CharacterSheetSettingTab extends PluginSettingTab {
	plugin: CharacterSheetPlugin;

	constructor(app: App, plugin: CharacterSheetPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Character Sheet Settings' });

		new Setting(containerEl)
			.setName('Default proficiency')
			.setDesc('Default proficiency bonus for new characters')
			.addText(text => text
				.setValue(String(this.plugin.settings.defaultProficiency))
				.onChange(async (value) => {
					this.plugin.settings.defaultProficiency = parseInt(value) || 2;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-calculate')
			.setDesc('Automatically calculate modifiers and skill bonuses from attribute values')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoCalculate)
				.onChange(async (value) => {
					this.plugin.settings.autoCalculate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Dice notification duration')
			.setDesc('How long dice roll notifications stay visible (milliseconds)')
			.addText(text => text
				.setValue(String(this.plugin.settings.diceNotificationDuration))
				.onChange(async (value) => {
					this.plugin.settings.diceNotificationDuration = parseInt(value) || 5000;
					await this.plugin.saveSettings();
				}));
	}
}
