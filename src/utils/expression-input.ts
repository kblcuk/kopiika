/**
 * Validation and insertion logic for arithmetic expression input.
 *
 * Uses a transition table to enforce which operator classes (arithmetic, open
 * paren, close paren) can follow each character class (digit, operator, open
 * paren, close paren, start-of-input).
 */

const ARITHMETIC_OPS = new Set(['+', '\u2212', '\u00D7', '\u00F7']);

type CharClass = 'digit' | 'op' | 'open' | 'close' | 'start';
type OpClass = 'op' | 'open' | 'close';

function classifyChar(ch: string | undefined): CharClass {
	if (!ch) return 'start';
	if ((ch >= '0' && ch <= '9') || ch === '.') return 'digit';
	if (ARITHMETIC_OPS.has(ch)) return 'op';
	if (ch === '(') return 'open';
	if (ch === ')') return 'close';
	return 'start';
}

const CAN_FOLLOW: Record<CharClass, Set<OpClass>> = {
	start: new Set(['open']),
	digit: new Set(['op', 'close']),
	op: new Set(['open']),
	open: new Set(['open']),
	close: new Set(['op', 'close']),
};

function classifyOp(op: string): OpClass {
	if (op === '(') return 'open';
	if (op === ')') return 'close';
	return 'op';
}

/**
 * Attempt to insert an operator into an expression string at a given cursor
 * range. Returns the new string and cursor position, or `null` if the
 * insertion is invalid.
 */
export function tryInsertOperator(
	value: string,
	op: string,
	selectionStart: number,
	selectionEnd: number
): { value: string; cursor: number } | null {
	let before = value.slice(0, selectionStart);
	const after = value.slice(selectionEnd);

	const prevClass = classifyChar(before[before.length - 1]);
	const opClass = classifyOp(op);

	if (!CAN_FOLLOW[prevClass].has(opClass)) {
		if (prevClass === 'op' && opClass === 'op') {
			before = before.slice(0, -1);
		} else {
			return null;
		}
	}

	if (op === ')') {
		const opens = (before.match(/\(/g) || []).length;
		const closes = (before.match(/\)/g) || []).length;
		if (opens <= closes) return null;
	}

	const next = before + op + after;
	return { value: next, cursor: before.length + op.length };
}

/** Normalize comma decimal separators to dots. */
export function normalizeDecimalSeparator(v: string): string {
	return v.replace(/,/g, '.');
}

/**
 * Walks the candidate input and, for each operand chunk (delimited by the
 * arithmetic operator characters), allows at most one decimal separator
 * (either `,` or `.`). A second separator typed within the same operand is
 * dropped. Operator characters themselves are preserved verbatim, including
 * a leading `-` which is treated as a sign on the following operand.
 *
 * Used by the amount input pipeline so the user can type either separator
 * without it being silently converted on every keystroke, while still
 * preventing nonsense like `100,5,3` or `100,5.3` from accumulating.
 */
const OPERATOR_CHARS = new Set<string>(['+', '-', '−', '×', '÷', '(', ')']);
const OPERATOR_SPLIT_RE = /([+\-−×÷()])/;

export function enforceSingleSeparator(value: string): string {
	if (!value) return value;
	return value
		.split(OPERATOR_SPLIT_RE)
		.map((part) => {
			// Operator chars come through as standalone 1-char segments after split.
			if (part.length === 1 && OPERATOR_CHARS.has(part)) return part;
			let seenSep = false;
			let out = '';
			for (const ch of part) {
				if (ch === '.' || ch === ',') {
					if (seenSep) continue;
					seenSep = true;
				}
				out += ch;
			}
			return out;
		})
		.join('');
}
