import type CharacterSheetPlugin from './main';

interface AbilityBlock {
	name: string;
	action: string;
	cost: string;
	target: string;
	description: string;
	notes: string[];
}

function parseAbilityBlock(source: string): AbilityBlock | null {
	const parts = source.split(/^---$/m, 2);
	const headerRaw = parts[0]?.trim() ?? '';
	const description = parts[1]?.trim() ?? '';

	if (!headerRaw) return null;

	const fields: Record<string, string> = {};
	const notes: string[] = [];

	for (const line of headerRaw.split('\n')) {
		// Collect note lines (supports multiple)
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
		action: fields['action'] ?? '',
		cost: fields['cost'] ?? '',
		target: fields['target'] ?? '',
		description,
		notes,
	};
}

export function registerAbilityRenderer(plugin: CharacterSheetPlugin) {
	plugin.registerMarkdownCodeBlockProcessor('ability', (source, el) => {
		const ability = parseAbilityBlock(source);
		if (!ability) {
			el.createDiv({ cls: 'cs-error', text: 'Invalid ability block. Requires at least "name: ..."' });
			return;
		}

		const card = el.createDiv({ cls: 'cs-ability' });

		// Header row: name + cost | action tag
		const header = card.createDiv({ cls: 'cs-ability-header' });

		const nameGroup = header.createDiv({ cls: 'cs-ability-name-group' });
		nameGroup.createSpan({ cls: 'cs-ability-name', text: ability.name });
		if (ability.action) {
			const actions = ability.action.split(',').map(a => a.trim()).filter(a => a);
			for (const action of actions) {
				nameGroup.createSpan({ cls: 'cs-ability-action', text: action });
			}
		}

		const tags = header.createDiv({ cls: 'cs-ability-tags' });
		if (ability.cost) {
			tags.createSpan({ cls: 'cs-ability-cost', text: ability.cost });
		}
		// Target line
		if (ability.target) {
			const targetRow = card.createDiv({ cls: 'cs-ability-target-row' });
			targetRow.createSpan({ cls: 'cs-ability-target-label', text: 'Target' });
			targetRow.createSpan({ cls: 'cs-ability-target', text: ability.target });
		}

		// Description
		if (ability.description) {
			card.createDiv({ cls: 'cs-ability-desc', text: ability.description });
		}

		// Notes
		if (ability.notes.length > 0) {
			const notesEl = card.createDiv({ cls: 'cs-ability-notes' });
			for (const note of ability.notes) {
				const noteItem = notesEl.createDiv({ cls: 'cs-ability-note' });
				noteItem.createSpan({ cls: 'cs-ability-note-icon', text: '\u26A0' });
				noteItem.createSpan({ cls: 'cs-ability-note-text', text: note });
			}
		}
	});
}
