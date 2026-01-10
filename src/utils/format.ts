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

// Get progress percentage (capped at 100 for display, but can exceed)
export function getProgressPercent(actual: number, planned: number): number {
	if (planned === 0) return actual > 0 ? 100 : 0;
	return Math.min((actual / planned) * 100, 100);
}

// Check if overspent
export function isOverspent(actual: number, planned: number): boolean {
	return actual > planned && planned > 0;
}
