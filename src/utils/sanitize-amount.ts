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
