// Round monetary value to 2 decimal places to avoid floating point precision issues
export function roundMoney(amount: number): number {
	return Math.round(amount * 100) / 100;
}

// Format currency amounts
export function formatAmount(amount: number, currency: string = 'UAH'): string {
	const absAmount = Math.abs(amount);
	const formatted = new Intl.NumberFormat(void 0, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(absAmount);

	const sign = amount < 0 ? '-' : '';
	return `${sign}${formatted}`;
}

// Format period for display
export function formatPeriod(period: string): string {
	const [year, month] = period.split('-').map(Number);
	const date = new Date(year, month - 1);
	return date.toLocaleDateString(void 0, { month: 'long', year: 'numeric' });
}

// Get progress percentage (can exceed 100% to properly detect overspending)
export function getProgressPercent(actual: number, planned: number): number {
	if (planned === 0) return actual > 0 ? 100 : 0;
	return (actual / planned) * 100;
}

// Check if overspent
export function isOverspent(actual: number, planned: number): boolean {
	return actual > planned && planned > 0;
}

// Parse a currency string to a number, handling both European (1.234,56) and US (1,234.56) formats.
// Detects the decimal separator from the input pattern rather than relying on locale.
export function reverseFormatCurrency(amount: string, _currency = 'EUR') {
	// Check for negative sign
	const isNegative = amount.trim().startsWith('-');

	// Remove any non-numeric characters except . and ,
	const cleaned = amount.replace(/[^\d.,]/g, '');

	if (!cleaned) return NaN;

	const lastDot = cleaned.lastIndexOf('.');
	const lastComma = cleaned.lastIndexOf(',');

	let result: number;

	if (lastDot === -1 && lastComma === -1) {
		// No separators - just a whole number
		result = parseFloat(cleaned);
	} else if (lastDot === -1) {
		// Only commas - comma is decimal if followed by 1-2 digits at end
		const afterComma = cleaned.length - lastComma - 1;
		if (afterComma <= 2) {
			result = parseFloat(cleaned.replace(',', '.'));
		} else {
			// Otherwise it's a thousands separator
			result = parseFloat(cleaned.replace(/,/g, ''));
		}
	} else if (lastComma === -1) {
		// Only dots - dot is decimal if followed by 1-2 digits at end
		const afterDot = cleaned.length - lastDot - 1;
		if (afterDot <= 2) {
			result = parseFloat(cleaned);
		} else {
			// Otherwise it's a thousands separator (European style without decimals)
			result = parseFloat(cleaned.replace(/\./g, ''));
		}
	} else if (lastComma > lastDot) {
		// Both separators, comma last: European format 1.234,56
		result = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
	} else {
		// Both separators, dot last: US format 1,234.56
		result = parseFloat(cleaned.replace(/,/g, ''));
	}

	return isNegative ? -result : result;
}
