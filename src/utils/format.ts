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

// Make sure we parse decimals correctly regardless of locale
// We use undefined for locale to use the user's default locale
export function reverseFormatCurrency(amount: string, currency = 'EUR') {
	const separatorDecimal = new Intl.NumberFormat(undefined, {
		style: 'decimal',
	})
		.format(11.11)
		.replace(/\d/g, '');

	const separatorThousands = new Intl.NumberFormat(undefined, {
		style: 'decimal',
	})
		.format(1111)
		.replace(/\d/g, '');

	const symbolOnLeft = new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency,
	})
		.format(1)
		.replace(new RegExp(`\\d|[${separatorDecimal}${separatorThousands}]*`, 'g'), '');

	const stringNumber = amount
		.replace(new RegExp(`[${separatorThousands}]`, 'g'), '')
		.replace(separatorDecimal, '.')
		.replace(new RegExp(`[${symbolOnLeft}]`, 'g'), '');

	return parseFloat(stringNumber);
}
