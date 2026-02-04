import {App, PluginSettingTab, Setting} from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	mySetting: string;
	solarSystemFolder: string;
	starName: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	solarSystemFolder: '',
	starName: 'Sol',
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Solar system folder')
			.setDesc('Vault folder containing planet .md files (e.g. "Planets")')
			.addText(text => text
				.setPlaceholder('Planets')
				.setValue(this.plugin.settings.solarSystemFolder)
				.onChange(async (value) => {
					this.plugin.settings.solarSystemFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Star name')
			.setDesc('Display name for the central star')
			.addText(text => text
				.setPlaceholder('Sol')
				.setValue(this.plugin.settings.starName)
				.onChange(async (value) => {
					this.plugin.settings.starName = value;
					await this.plugin.saveSettings();
				}));
	}
}
