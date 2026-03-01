import { TFile } from 'obsidian';
import type CharacterSheetPlugin from './main';
import { CharacterSheet } from './types';
import { ATTRIBUTES, getEffectiveModifier, parseCharacterSheet } from './data';

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

export function renderDescription(parent: HTMLElement, description: string, plugin?: CharacterSheetPlugin, sheet?: CharacterSheet) {
	const desc = parent.createDiv({ cls: 'cs-ability-desc' });
	const lines = description.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (i > 0) desc.createEl('br');
		if (plugin) {
			renderLineWithRefs(desc, lines[i]!, plugin, sheet);
		} else {
			renderLineWithDice(desc, lines[i]!, sheet);
		}
	}
}

// Renders dice expressions like 2d6+1, 1d4, DC 15 as styled inline elements
// Also handles attribute references like 1d6+Acuity, 1d8+Acuity+Grit, 1d6+Acuity/2
const ATTR_NAMES = ATTRIBUTES.map(a => a.label).join('|');
const ATTR_WITH_DIV = `(?:${ATTR_NAMES})(?:/\\d+)?`;
const DICE_REGEX_SRC = `\\b(\\d*d\\d+(?:\\s*[+\\-]\\s*(?:\\d+|${ATTR_WITH_DIV}))+)\\b|\\b(\\d*d\\d+)\\b|(?:DC\\s*\\d+)`;

function resolveAttrDice(expr: string, sheet?: CharacterSheet): { display: string; hasAttrs: boolean } {
	if (!sheet) return { display: expr, hasAttrs: false };

	// Match attribute names with optional /N divisor
	const attrRegex = new RegExp(`(${ATTR_NAMES})(?:/(\\d+))?`, 'gi');
	const foundParts: { label: string; divisor: number; mod: number }[] = [];
	let totalAttrMod = 0;
	let hasAttrs = false;

	let attrMatch;
	while ((attrMatch = attrRegex.exec(expr)) !== null) {
		const attrName = attrMatch[1]!;
		const divisor = attrMatch[2] ? parseInt(attrMatch[2]) : 1;
		const attrDef = ATTRIBUTES.find(a => a.label.toLowerCase() === attrName.toLowerCase());
		if (attrDef) {
			hasAttrs = true;
			const rawMod = getEffectiveModifier(sheet, attrDef.name);
			const effectiveMod = Math.floor(rawMod / divisor);
			totalAttrMod += effectiveMod;
			foundParts.push({ label: attrDef.label, divisor, mod: effectiveMod });
		}
	}

	if (!hasAttrs) return { display: expr, hasAttrs: false };

	// Strip out all "+AttrName(/N)?" or "-AttrName(/N)?" segments
	let cleaned = expr;
	for (const part of foundParts) {
		const divPart = part.divisor > 1 ? `/\\d+` : '';
		cleaned = cleaned.replace(new RegExp(`\\s*[+\\-]\\s*${part.label}${divPart}`, 'gi'), '');
	}

	// Build the parenthetical label: "Acuity/2" or "Acuity+Grit"
	const attrLabel = foundParts.map(p => p.divisor > 1 ? `${p.label}/${p.divisor}` : p.label).join('+');

	const sign = totalAttrMod >= 0 ? '+' : '';
	return { display: `${cleaned}${sign}${totalAttrMod} (${attrLabel})`, hasAttrs: true };
}

// Matches distances like 10ft, 5 ft, 30ft
const DIST_REGEX_SRC = `\\b(\\d+)\\s*ft\\b`;

// Combined regex: dice OR distance (dice first so it takes priority)
const INLINE_REGEX_SRC = `${DICE_REGEX_SRC}|(${DIST_REGEX_SRC})`;

function renderLineWithDice(container: HTMLElement, text: string, sheet?: CharacterSheet) {
	let lastIndex = 0;
	let match;
	const regex = new RegExp(INLINE_REGEX_SRC, 'gi');

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			container.appendText(text.slice(lastIndex, match.index));
		}

		// Check if this is a distance match (last capture groups)
		const distGroup = match[match.length - 2];
		if (distGroup && /^\d+\s*ft$/i.test(match[0])) {
			const distSpan = container.createSpan({ cls: 'cs-dist-expr' });
			distSpan.createSpan({ cls: 'cs-dist-icon', text: '\uD83D\uDC63' });
			distSpan.createSpan({ text: match[0] });
		} else {
			const raw = match[0];
			const { display } = resolveAttrDice(raw, sheet);

			const diceSpan = container.createSpan({ cls: 'cs-dice-expr' });
			diceSpan.createSpan({ cls: 'cs-dice-icon', text: '\uD83C\uDFB2' });
			diceSpan.createSpan({ text: display });
		}

		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		container.appendText(text.slice(lastIndex));
	}
}

function renderLineWithRefs(container: HTMLElement, line: string, plugin: CharacterSheetPlugin, sheet?: CharacterSheet) {
	// Split on {StatusName} patterns
	const regex = /\{([^}]+)\}/g;
	let lastIndex = 0;
	let match;

	while ((match = regex.exec(line)) !== null) {
		// Text before the match (with dice rendering)
		if (match.index > lastIndex) {
			renderLineWithDice(container, line.slice(lastIndex, match.index), sheet);
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
						renderLineWithDice(descDiv, descLines[j]!, sheet);
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

	// Remaining text after last match (with dice rendering)
	if (lastIndex < line.length) {
		renderLineWithDice(container, line.slice(lastIndex), sheet);
	}
}

export function registerAbilityRenderer(plugin: CharacterSheetPlugin) {
	plugin.registerMarkdownCodeBlockProcessor('ability', (source, el, ctx) => {
		const ability = parseAbilityBlock(source);
		if (!ability) {
			el.createDiv({ cls: 'cs-error', text: 'Invalid ability block. Requires at least "name: ..."' });
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
			renderDescription(card, ability.description, plugin, sheet);
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
