import { App, PluginSettingTab, Setting } from 'obsidian';
import type CharacterSheetPlugin from './main';

export interface CharacterSheetSettings {
	defaultProficiency: number;
	autoCalculate: boolean;
	diceNotificationDuration: number;
	typeColors: Record<string, string>;
}

export const DEFAULT_SETTINGS: CharacterSheetSettings = {
	defaultProficiency: 2,
	autoCalculate: true,
	diceNotificationDuration: 5000,
	typeColors: {},
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

		// Type Colors section
		containerEl.createEl('h2', { text: 'Type Colors' });
		containerEl.createEl('p', {
			text: 'Assign colors to status effect types. Use any CSS color value (e.g. #ff5555, red, rgb(255,85,85)).',
			cls: 'setting-item-description',
		});

		const typeColors = this.plugin.settings.typeColors;

		// Render existing entries
		const entriesContainer = containerEl.createDiv({ cls: 'cs-type-colors-list' });
		this.renderTypeEntries(entriesContainer);

		// Add new type
		let newTypeName = '';
		let newTypeColor = '';
		new Setting(containerEl)
			.setName('Add type color')
			.addText(text => text
				.setPlaceholder('Type name')
				.onChange(v => { newTypeName = v; }))
			.addColorPicker(picker => picker
				.setValue('#e0b300')
				.onChange(v => { newTypeColor = v; }))
			.addButton(btn => btn
				.setButtonText('Add')
				.setCta()
				.onClick(async () => {
					const name = newTypeName.trim();
					if (!name) return;
					this.plugin.settings.typeColors[name.toLowerCase()] = newTypeColor || '#e0b300';
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private renderTypeEntries(container: HTMLElement) {
		const typeColors = this.plugin.settings.typeColors;
		const keys = Object.keys(typeColors);

		if (keys.length === 0) {
			container.createEl('p', {
				text: 'No type colors configured. Types will use the default yellow.',
				cls: 'setting-item-description',
			});
			return;
		}

		for (const key of keys) {
			new Setting(container)
				.setName(key)
				.addColorPicker(picker => picker
					.setValue(typeColors[key]!)
					.onChange(async (v) => {
						this.plugin.settings.typeColors[key] = v;
						await this.plugin.saveSettings();
					}))
				.addButton(btn => btn
					.setButtonText('Remove')
					.setWarning()
					.onClick(async () => {
						delete this.plugin.settings.typeColors[key];
						await this.plugin.saveSettings();
						this.display();
					}));
		}
	}
}
