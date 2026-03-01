import { TFile } from 'obsidian';
import { renderDescription } from './AbilityRenderer';
import { CharacterSheet } from './types';
import { parseCharacterSheet } from './data';
import type CharacterSheetPlugin from './main';

export interface ResourceBlock {
	name: string;
	description: string;
	notes: string[];
}

export function parseResourceBlock(source: string): ResourceBlock | null {
	const parts = source.split(/^---$/m, 2);
	const headerRaw = parts[0]?.trim() ?? '';
	const description = parts[1]?.trim() ?? '';

	if (!headerRaw) return null;

	const fields: Record<string, string> = {};
	const notes: string[] = [];

	for (const line of headerRaw.split('\n')) {
		const noteMatch = line.match(/^note\s*:\s*(.+)$/i);
		if (noteMatch) {
			notes.push(noteMatch[1]!.trim());
			continue;
		}

		const match = line.match(/^(\w+)\s*:\s*(.+)$/);
		if (match) {
			fields[match[1]!.toLowerCase()] = match[2]!.trim();
		}
	}

	if (!fields['name']) return null;

	return {
		name: fields['name'],
		description,
		notes,
	};
}

export function extractResources(content: string): ResourceBlock[] {
	const resources: ResourceBlock[] = [];
	const regex = /```res\s*\n([\s\S]*?)```/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		const parsed = parseResourceBlock(match[1]!);
		if (parsed) resources.push(parsed);
	}
	return resources;
}

export function registerResourceRenderer(plugin: CharacterSheetPlugin) {
	plugin.registerMarkdownCodeBlockProcessor('res', (source, el, ctx) => {
		const resource = parseResourceBlock(source);
		if (!resource) {
			el.createDiv({ cls: 'cs-error', text: 'Invalid resource block. Requires at least "name: ..."' });
			return;
		}

		// Try to resolve character sheet from the file this block is in
		let sheet: CharacterSheet | undefined;
		const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (file) {
			const cache = plugin.app.metadataCache.getFileCache(file as TFile);
			const fm = cache?.frontmatter;
			if (fm && fm.character_sheet === true) {
				sheet = parseCharacterSheet(fm) ?? undefined;
			}
		}

		const card = el.createDiv({ cls: 'cs-resource' });

		// Header: name
		const header = card.createDiv({ cls: 'cs-resource-header' });
		header.createSpan({ cls: 'cs-resource-name', text: resource.name });

		// Description
		if (resource.description) {
			renderDescription(card, resource.description, plugin, sheet);
		}

		// Notes
		if (resource.notes.length > 0) {
			const notesEl = card.createDiv({ cls: 'cs-ability-notes' });
			for (const note of resource.notes) {
				const noteItem = notesEl.createDiv({ cls: 'cs-ability-note' });
				noteItem.createSpan({ cls: 'cs-ability-note-icon', text: '\u26A0' });
				noteItem.createSpan({ cls: 'cs-ability-note-text', text: note });
			}
		}
	});
}
