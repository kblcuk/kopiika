import { CURRENCY_SYMBOLS } from '@/src/constants/currencies';
import { getCurrencyDecimalPlaces } from './currency-precision';
import { toMajor, toMinor } from './money';

export const DEFAULT_CURRENCY = 'EUR';

// Get a display symbol for a currency code (falls back to the code itself)
export function getCurrencySymbol(currency: string): string {
	return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency;
}

// KII-120: amounts are stored as integer minor units. formatAmount converts to
// major at the display boundary; callers pass the raw DB / store value.
export function formatAmount(amountMinor: number, currency: string): string {
	const dp = getCurrencyDecimalPlaces(currency);
	const major = toMajor(amountMinor, currency) || 0; // -0 → 0
	const absAmount = Math.abs(major);
	const formatted = new Intl.NumberFormat(void 0, {
		minimumFractionDigits: dp,
		maximumFractionDigits: dp,
	}).format(absAmount);

	const sign = major < 0 ? '-' : '';
	return `${sign}${formatted}`;
}

// Format minor-unit amount for assignment to an editable amount input. Same
// locale decimal separator as formatAmount (so chip-fills agree with user-typed
// values), but no thousands grouping and no forced trailing zeros — the input
// keeps the shape the user would have typed themselves.
export function formatAmountForInput(amountMinor: number, currency: string): string {
	const dp = getCurrencyDecimalPlaces(currency);
	const major = toMajor(amountMinor, currency) || 0;
	return new Intl.NumberFormat(void 0, {
		minimumFractionDigits: 0,
		maximumFractionDigits: dp,
		useGrouping: false,
	}).format(major);
}

// KII-137: substring-match a search query against a formatted amount string,
// treating dot and comma as the same decimal separator. formatAmount renders
// with the device locale's separator (e.g. "30,50" in EU locales), so a user
// typing either "30.5" or "30,5" must match. Normalizing both sides makes the
// comparison separator-agnostic in either direction.
export function amountMatchesSearch(formattedAmount: string, query: string): boolean {
	const normalize = (s: string) => s.replace(/,/g, '.');
	return normalize(formattedAmount).includes(normalize(query));
}

// Format period for display
export function formatPeriod(period: string): string {
	const [year, month] = period.split('-').map(Number) as [number, number];
	const date = new Date(year, month - 1);
	return date.toLocaleDateString(void 0, { month: 'long', year: 'numeric' });
}

/**
 * A date-field value: weekday, day, month, year in the device locale.
 *
 * Deliberately absolute even when the date is today or yesterday. The quick
 * preset chips beside the field already name the relative day, and the
 * highlighted chip says it more precisely than the text could — so the field's
 * job is to supply what the chips cannot: the actual date.
 */
export function formatFullDate(date: Date): string {
	return date.toLocaleDateString(void 0, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
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

// Parse a currency string to a major-unit number, handling both European
// (1.234,56) and US (1,234.56) formats. Detects the decimal separator from
// the input pattern rather than relying on locale or currency.
export function reverseFormatCurrency(amount: string) {
	// Check for negative sign
	const isNegative = amount.trim().startsWith('-');

	// Remove any non-numeric characters except . and ,
	const cleaned = amount.replace(/[^\d.,]/g, '');

	if (!cleaned) return NaN;

	const lastSep = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
	const hasBoth = cleaned.includes('.') && cleaned.includes(',');
	const digitsAfter = cleaned.length - lastSep - 1;

	// The last separator is the decimal point when both separators are present
	// (grouping + decimal, e.g. 1.234,56 or 1,234.56) or a lone separator has
	// ≤2 trailing digits (e.g. 1,15). Otherwise it's a thousands separator.
	const isDecimal = lastSep !== -1 && (hasBoth || digitsAfter <= 2);

	const digits = cleaned.replace(/[.,]/g, '');
	const cut = digits.length - digitsAfter;
	const result = isDecimal
		? parseFloat(`${digits.slice(0, cut)}.${digits.slice(cut)}`)
		: parseFloat(digits);

	return isNegative ? -result : result;
}

// KII-120: convenience helper for the common pattern of parsing user input
// straight into minor units. Returns NaN if the string can't be parsed.
export function parseAmountToMinor(input: string, currency: string): number {
	const major = reverseFormatCurrency(input);
	if (!Number.isFinite(major)) return NaN;
	return toMinor(major, currency);
}
