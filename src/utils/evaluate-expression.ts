import { roundMoney } from './format';

function isMulDiv(ch: string): boolean {
	return ch === '\u00D7' || ch === '*' || ch === '\u00F7' || ch === '/';
}

function isAddSub(ch: string): boolean {
	return ch === '+' || ch === '\u2212' || ch === '-';
}

export function evaluateExpression(input: string): number | null {
	const expr = input.replace(/\s/g, '');
	if (!expr) return null;

	let pos = 0;

	function parseAtom(): number | null {
		// Parenthesized sub-expression
		if (pos < expr.length && expr[pos] === '(') {
			pos++;
			const inner = parseAddSubExpr();
			if (inner === null || pos >= expr.length || expr[pos] !== ')') return null;
			pos++;
			return inner;
		}

		// Numeric literal
		const start = pos;
		if (pos < expr.length && expr[pos] === '-') pos++;
		if (pos >= expr.length || (expr[pos] < '0' && expr[pos] !== '.') || expr[pos] > '9') {
			if (expr[pos] !== '.') {
				pos = start;
				return null;
			}
		}
		let hasDot = false;
		while (pos < expr.length && ((expr[pos] >= '0' && expr[pos] <= '9') || expr[pos] === '.')) {
			if (expr[pos] === '.') {
				if (hasDot) { pos = start; return null; }
				hasDot = true;
			}
			pos++;
		}
		if (pos === start || (pos === start + 1 && expr[start] === '-')) return null;
		const num = parseFloat(expr.slice(start, pos));
		return isNaN(num) ? null : num;
	}

	function parseMulDivExpr(): number | null {
		let left = parseAtom();
		if (left === null) return null;
		while (pos < expr.length && isMulDiv(expr[pos])) {
			const op = expr[pos];
			pos++;
			const right = parseAtom();
			if (right === null) return null;
			if ((op === '\u00F7' || op === '/') && right === 0) return null;
			left = op === '\u00D7' || op === '*' ? left * right : left / right;
		}
		return left;
	}

	function parseAddSubExpr(): number | null {
		let left = parseMulDivExpr();
		if (left === null) return null;
		while (pos < expr.length && isAddSub(expr[pos])) {
			const op = expr[pos];
			pos++;
			const right = parseMulDivExpr();
			if (right === null) return null;
			left = op === '+' ? left + right : left - right;
		}
		return left;
	}

	const result = parseAddSubExpr();
	if (result === null || pos !== expr.length) return null;
	return roundMoney(result);
}
