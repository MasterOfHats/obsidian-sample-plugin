import type CharacterSheetPlugin from './main';

export interface AbilityBlock {
	name: string;
	action: string;
	cost: string;
	target: string;
	description: string;
	notes: string[];
}

export function parseAbilityBlock(source: string): AbilityBlock | null {
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

export function extractAbilities(content: string): AbilityBlock[] {
	const abilities: AbilityBlock[] = [];
	const regex = /```ability\s*\n([\s\S]*?)```/g;
	let match;
	while ((match = regex.exec(content)) !== null) {
		const parsed = parseAbilityBlock(match[1]!);
		if (parsed) abilities.push(parsed);
	}
	return abilities;
}

export function renderDescription(parent: HTMLElement, description: string, plugin?: CharacterSheetPlugin) {
	const desc = parent.createDiv({ cls: 'cs-ability-desc' });
	const lines = description.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (i > 0) desc.createEl('br');
		if (plugin) {
			renderLineWithRefs(desc, lines[i]!, plugin);
		} else {
			desc.appendText(lines[i]!);
		}
	}
}

function renderLineWithRefs(container: HTMLElement, line: string, plugin: CharacterSheetPlugin) {
	// Split on {StatusName} patterns
	const regex = /\{([^}]+)\}/g;
	let lastIndex = 0;
	let match;

	while ((match = regex.exec(line)) !== null) {
		// Text before the match
		if (match.index > lastIndex) {
			container.appendText(line.slice(lastIndex, match.index));
		}

		const refName = match[1]!.trim();
		const span = container.createSpan({ cls: 'cs-status-ref', text: refName });

		// Build tooltip, appended to body for no clipping
		const tooltip = document.body.createDiv({ cls: 'cs-status-ref-tooltip' });
		tooltip.style.display = 'none';

		// Load content and apply type color
		let loaded = false;

		const loadEffect = async () => {
			if (loaded) return;
			loaded = true;
			const { getStatusIndex, getTypeColor } = await import('./StatusEffectRenderer');
			const index = await getStatusIndex(plugin);
			const effect = index.get(refName.toLowerCase());

			if (effect) {
				// Color the inline ref span by the first type's color
				if (effect.types.length > 0) {
					const primaryColor = getTypeColor(plugin, effect.types[0]!);
					if (primaryColor) {
						span.style.color = primaryColor;
						span.style.borderBottomColor = primaryColor;
						tooltip.style.borderLeftColor = primaryColor;
					}
				}

				const header = tooltip.createDiv({ cls: 'cs-status-header' });
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
					const descDiv = tooltip.createDiv({ cls: 'cs-ability-desc' });
					const descLines = effect.description.split('\n');
					for (let j = 0; j < descLines.length; j++) {
						if (j > 0) descDiv.createEl('br');
						descDiv.appendText(descLines[j]!);
					}
				}
			} else {
				tooltip.createDiv({ cls: 'cs-status-ref-missing', text: `Unknown status: ${refName}` });
			}
		};

		// Eagerly load so the span color is applied without waiting for hover
		void loadEffect();

		span.addEventListener('mouseenter', async () => {
			await loadEffect();

			tooltip.style.display = 'block';
			requestAnimationFrame(() => {
				const spanRect = span.getBoundingClientRect();
				const tipRect = tooltip.getBoundingClientRect();

				let top = spanRect.top - tipRect.height - 6;
				if (top < 4) {
					top = spanRect.bottom + 6;
				}

				let left = spanRect.left + (spanRect.width / 2) - (tipRect.width / 2);
				left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));

				tooltip.style.top = `${top}px`;
				tooltip.style.left = `${left}px`;
			});
		});

		span.addEventListener('mouseleave', () => {
			tooltip.style.display = 'none';
		});

		// Clean up body tooltip when span is removed
		const observer = new MutationObserver(() => {
			if (!span.isConnected) {
				tooltip.remove();
				observer.disconnect();
			}
		});
		if (span.parentElement) {
			observer.observe(span.parentElement, { childList: true, subtree: true });
		}

		lastIndex = match.index + match[0].length;
	}

	// Remaining text after last match
	if (lastIndex < line.length) {
		container.appendText(line.slice(lastIndex));
	}
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
			renderDescription(card, ability.description, plugin);
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
