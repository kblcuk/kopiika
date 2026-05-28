/**
 * Sanitize a plain-number input string into a valid amount for the given
 * currency precision. First decimal separator wins; subsequent separators are
 * dropped; digits past precision are dropped; non-numeric chars are stripped.
 *
 * Designed for live `onChangeText` use — preserves trailing/leading separators
 * mid-typing so the user can finish typing fractions.
 */
export function sanitizeAmountInput(value: string, opts: { maxDecimalPlaces: number }): string {
	const cleaned = value.replace(/[^\d.,]/g, '').replace(/,/g, '.');
	if (opts.maxDecimalPlaces === 0) return cleaned.replace(/\..*$/, '');
	const [whole = '', ...rest] = cleaned.split('.');
	const fraction = rest.join('').slice(0, opts.maxDecimalPlaces);
	return rest.length ? `${whole}.${fraction}` : whole;
}

// Operator chars include both ASCII (`-`, `*`, `/`) and Unicode (`−` U+2212,
// `×` U+00D7, `÷` U+00F7) variants because evaluate-expression accepts both
// and the operator toolbar inserts the Unicode forms.
const ALLOWED_CHARS_RE = /[^\d.,+\-−*×/÷() ]/g;
const OPERAND_CHUNK_RE = /[\d.,]+/g;

/**
 * Sanitize an arithmetic expression input. Splits on operator boundaries and
 * runs `sanitizeAmountInput` per operand; preserves operators and whitespace.
 */
export function sanitizeExpressionInput(value: string, opts: { maxDecimalPlaces: number }): string {
	const cleaned = value.replace(ALLOWED_CHARS_RE, '');
	return cleaned.replace(OPERAND_CHUNK_RE, (operand) => sanitizeAmountInput(operand, opts));
}
