import { App, Modal, Notice, Setting } from 'obsidian';
import { formatModifier } from './data';

export class DiceRollerModal extends Modal {
	private label: string;
	private bonus: number;

	constructor(app: App, label: string, bonus: number) {
		super(app);
		this.label = label;
		this.bonus = bonus;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cs-dice-modal');

		contentEl.createEl('h2', { text: `Roll: ${this.label}` });
		contentEl.createDiv({ cls: 'cs-dice-info', text: `d20 ${formatModifier(this.bonus)}` });

		const resultArea = contentEl.createDiv({ cls: 'cs-dice-result' });

		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('Roll d20').setCta().onClick(() => {
				this.rollD20(resultArea);
			}));

		// Arbitrary dice expression
		contentEl.createEl('h3', { text: 'Custom Roll' });
		let customExpr = '2d6+3';
		const customSetting = new Setting(contentEl)
			.setName('Expression')
			.addText(t => t.setValue(customExpr).setPlaceholder('e.g. 2d6+3').onChange(v => { customExpr = v; }))
			.addButton(btn => btn.setButtonText('Roll').onClick(() => {
				this.rollExpression(customExpr, resultArea);
			}));
	}

	onClose() {
		this.contentEl.empty();
	}

	private rollD20(resultArea: HTMLElement) {
		const roll = Math.floor(Math.random() * 20) + 1;
		const total = roll + this.bonus;
		const isCrit = roll === 20;
		const isFumble = roll === 1;

		resultArea.empty();
		const res = resultArea.createDiv({ cls: 'cs-roll-result' });
		res.createDiv({
			cls: `cs-roll-die ${isCrit ? 'cs-crit' : ''} ${isFumble ? 'cs-fumble' : ''}`,
			text: String(roll),
		});
		res.createDiv({ cls: 'cs-roll-modifier', text: formatModifier(this.bonus) });
		res.createDiv({ cls: 'cs-roll-equals', text: '=' });
		res.createDiv({ cls: 'cs-roll-total', text: String(total) });

		if (isCrit) res.createDiv({ cls: 'cs-roll-label cs-crit', text: 'Critical!' });
		if (isFumble) res.createDiv({ cls: 'cs-roll-label cs-fumble', text: 'Fumble!' });

		new Notice(`${this.label}: ${roll} ${formatModifier(this.bonus)} = ${total}${isCrit ? ' (CRIT!)' : ''}${isFumble ? ' (FUMBLE!)' : ''}`);
	}

	private rollExpression(expr: string, resultArea: HTMLElement) {
		const result = parseDiceExpression(expr);
		if (result === null) {
			new Notice('Invalid dice expression');
			return;
		}

		resultArea.empty();
		const res = resultArea.createDiv({ cls: 'cs-roll-result' });
		res.createDiv({ cls: 'cs-roll-expr', text: expr });
		res.createDiv({ cls: 'cs-roll-equals', text: '=' });
		res.createDiv({ cls: 'cs-roll-total', text: String(result.total) });
		if (result.details) {
			res.createDiv({ cls: 'cs-roll-details', text: result.details });
		}

		new Notice(`${expr} = ${result.total} ${result.details ? `(${result.details})` : ''}`);
	}
}

interface DiceResult {
	total: number;
	details: string;
}

function parseDiceExpression(expr: string): DiceResult | null {
	// Support expressions like: 2d6+3, 1d20, 3d8-2, d6
	const cleaned = expr.replace(/\s/g, '').toLowerCase();

	let total = 0;
	const allRolls: string[] = [];

	// Split on + or - while keeping the operator
	const terms = cleaned.match(/[+-]?[^+-]+/g);
	if (!terms) return null;

	for (const term of terms) {
		const diceMatch = term.match(/^([+-]?)(\d*)d(\d+)$/);
		if (diceMatch) {
			const sign = diceMatch[1] === '-' ? -1 : 1;
			const count = parseInt(diceMatch[2] || '1');
			const sides = parseInt(diceMatch[3]!);
			if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;

			const rolls: number[] = [];
			for (let i = 0; i < count; i++) {
				rolls.push(Math.floor(Math.random() * sides) + 1);
			}
			const sum = rolls.reduce((a, b) => a + b, 0);
			total += sign * sum;
			allRolls.push(`${sign === -1 ? '-' : ''}${count}d${sides}:[${rolls.join(',')}]`);
		} else {
			const num = parseInt(term);
			if (isNaN(num)) return null;
			total += num;
		}
	}

	return { total, details: allRolls.join(' ') };
}
