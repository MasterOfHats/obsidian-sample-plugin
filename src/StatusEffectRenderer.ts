import { TFile } from 'obsidian';
import { renderDescription } from './AbilityRenderer';
import type CharacterSheetPlugin from './main';

// Vault-wide status effect index, rebuilt lazily
let statusIndexPromise: Promise<Map<string, StatusEffectBlock>> | null = null;
let statusIndexBuiltFor: CharacterSheetPlugin | null = null;

async function buildStatusIndex(plugin: CharacterSheetPlugin): Promise<Map<string, StatusEffectBlock>> {
	const index = new Map<string, StatusEffectBlock>();
	const files = plugin.app.vault.getMarkdownFiles();
	for (const file of files) {
		const content = await plugin.app.vault.cachedRead(file);
		const effects = extractStatusEffects(content);
		for (const effect of effects) {
			index.set(effect.name.toLowerCase(), effect);
		}
	}
	return index;
}

export async function getStatusIndex(plugin: CharacterSheetPlugin): Promise<Map<string, StatusEffectBlock>> {
	if (statusIndexPromise && statusIndexBuiltFor === plugin) return statusIndexPromise;

	statusIndexBuiltFor = plugin;
	statusIndexPromise = buildStatusIndex(plugin);
	return statusIndexPromise;
}

export function invalidateStatusIndex() {
	statusIndexPromise = null;
}

export interface StatusEffectBlock {
	name: string;
	types: string[];
	description: string;
}

export function parseStatusEffectBlock(source: string): StatusEffectBlock | null {
	const parts = source.split(/^---$/m, 2);
	const headerRaw = parts[0]?.trim() ?? '';
	const description = parts[1]?.trim() ?? '';

	if (!headerRaw) return null;

	const fields: Record<string, string> = {};
	for (const line of headerRaw.split('\n')) {
		const match = line.match(/^(\w+)\s*:\s*(.+)$/);
		if (match) {
			fields[match[1]!.toLowerCase()] = match[2]!.trim();
		}
	}

	if (!fields['name']) return null;

	const types = fields['type']
		? fields['type'].split(',').map(t => t.trim()).filter(t => t)
		: [];

	return { name: fields['name'], types, description };
}

export function extractStatusEffects(content: string): StatusEffectBlock[] {
	const effects: StatusEffectBlock[] = [];
	const regex = /```status\s*\n([\s\S]*?)```/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		const parsed = parseStatusEffectBlock(match[1]!);
		if (parsed) effects.push(parsed);
	}
	return effects;
}

export function getTypeColor(plugin: CharacterSheetPlugin, typeName: string): string | null {
	return plugin.settings.typeColors[typeName.toLowerCase()] ?? null;
}

export function registerStatusEffectRenderer(plugin: CharacterSheetPlugin) {
	plugin.registerMarkdownCodeBlockProcessor('status', (source, el) => {
		const effect = parseStatusEffectBlock(source);
		if (!effect) {
			el.createDiv({ cls: 'cs-error', text: 'Invalid status block. Requires at least "name: ..."' });
			return;
		}

		const card = el.createDiv({ cls: 'cs-status' });

		// Use the first type's color for the card border, if configured
		const borderColor = effect.types.length > 0
			? getTypeColor(plugin, effect.types[0]!) : null;
		if (borderColor) {
			card.style.borderLeftColor = borderColor;
		}

		const header = card.createDiv({ cls: 'cs-status-header' });
		header.createSpan({ cls: 'cs-status-name', text: effect.name });

		if (effect.types.length > 0) {
			const tags = header.createDiv({ cls: 'cs-status-types' });
			for (const type of effect.types) {
				const tag = tags.createSpan({ cls: 'cs-status-type', text: type });
				const color = getTypeColor(plugin, type);
				if (color) {
					tag.style.borderColor = color;
					tag.style.color = color;
				}
			}
		}

		if (effect.description) {
			renderDescription(card, effect.description, plugin);
		}
	});
}
