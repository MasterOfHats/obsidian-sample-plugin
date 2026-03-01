import type CharacterSheetPlugin from './main';

interface AbilityBlock {
	name: string;
	action: string;
	cost: string;
	description: string;
}

function parseAbilityBlock(source: string): AbilityBlock | null {
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

	return {
		name: fields['name'],
		action: fields['action'] ?? '',
		cost: fields['cost'] ?? '',
		description,
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

		// Header row: name + tags
		const header = card.createDiv({ cls: 'cs-ability-header' });
		header.createSpan({ cls: 'cs-ability-name', text: ability.name });

		const tags = header.createDiv({ cls: 'cs-ability-tags' });
		if (ability.action) {
			tags.createSpan({ cls: 'cs-ability-action', text: ability.action });
		}
		if (ability.cost) {
			tags.createSpan({ cls: 'cs-ability-cost', text: ability.cost });
		}

		// Description
		if (ability.description) {
			card.createDiv({ cls: 'cs-ability-desc', text: ability.description });
		}
	});
}
