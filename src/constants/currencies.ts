/**
 * The currencies offered by the picker (KII-155). Codes outside this list are
 * still accepted as free text — `getCurrencySymbol` falls back to the raw code
 * and `Intl` supplies the decimal places — these are just the ones we name.
 */
export interface CurrencyOption {
	code: string;
	symbol: string;
	name: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
	{ code: 'EUR', symbol: '€', name: 'Euro' },
	{ code: 'USD', symbol: '$', name: 'US Dollar' },
	{ code: 'GBP', symbol: '£', name: 'Pound Sterling' },
	{ code: 'UAH', symbol: '₴', name: 'Hryvnia' },
	{ code: 'RUB', symbol: '₽', name: 'Ruble' },
	{ code: 'PLN', symbol: 'zł', name: 'Polish Złoty' },
	{ code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
	{ code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
	{ code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
	{ code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
	{ code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
	{ code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
	{ code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
];

// Map ISO currency codes to their symbols, derived so the two can't drift.
export const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
	CURRENCY_OPTIONS.map((c) => [c.code, c.symbol])
);

/**
 * Normalize free-typed input to an ISO-4217-shaped code, or `null` if it isn't
 * one. Deliberately shape-only: `Intl` accepts any well-formed three-letter
 * code, so validating against a closed list would reject real currencies we
 * simply haven't named.
 */
export function normalizeCurrencyCode(input: string): string | null {
	const code = input.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(code) ? code : null;
}
