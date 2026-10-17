// KII-120: Money is stored as integer minor units (cents for EUR, etc.) on
// every DB column and in every in-memory `Transaction.amount_minor` /
// `Plan.planned_amount_minor` / `RecurrenceTemplate.amount_minor` /
// `MarketValueSnapshot.amount_minor` field.
//
// Convert at the UI boundary only:
//   user input string  → parseAmountToMinor → DB write
//   DB read            → formatAmount(minor, currency) → display
//
// Why the rename matters: a bare `amount: 4321` next to a bare `amount: 43.21`
// is invisible at the call site. `amount_minor` makes the unit explicit, so a
// missed conversion blows up at type-check or `Number.isInteger` time rather
// than as a silently 100x-too-large transaction.
//
// Currency-aware: `getCurrencyDecimalPlaces` returns the per-currency exponent
// (USD/EUR=2, JPY=0, BHD=3). All conversions go through that helper — never
// hard-code `* 100`.

import { getCurrencyDecimalPlaces } from './currency-precision';

/**
 * Convert a major-unit amount (decimal, e.g. 43.21) into integer minor units
 * (e.g. 4321 for EUR). Decimal digits are shifted as text so values such as
 * 1.005 don't lose a cent to binary floating-point representation. Returns NaN
 * for non-finite input.
 */
export function toMinor(amountMajor: number, currency: string): number {
	if (!Number.isFinite(amountMajor)) return NaN;
	const dp = getCurrencyDecimalPlaces(currency);
	return decimalStringToMinor(amountMajor.toString(), dp);
}

/**
 * Convert decimal text (using `.` as its decimal mark) directly to minor units.
 * Prefer this for user/import strings; `toMinor` is for values already held as
 * numbers at calculation or API boundaries.
 */
export function decimalStringToMinor(value: string, decimalPlaces: number): number {
	let text = value.trim();
	if (!text || !Number.isInteger(decimalPlaces) || decimalPlaces < 0) return NaN;
	const sign = text.startsWith('-') ? -1 : 1;
	if (text[0] === '-' || text[0] === '+') text = text.slice(1);
	if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return NaN;

	// Number#toString may use exponent notation for finite values near zero or
	// the upper end of its range. Expand it before splitting decimal digits.
	const [coefficient = '', exponentText] = text.toLowerCase().split('e');
	const exponent = exponentText === undefined ? 0 : Number(exponentText);
	if (Math.abs(exponent) > 400) return NaN;
	const dot = coefficient.indexOf('.');
	const digits = coefficient.replace('.', '');
	// Index in `digits` where the minor-unit integer ends; pad with zeros so it
	// lands inside the string (leading zeros for tiny values, trailing for large).
	const cut = (dot === -1 ? coefficient.length : dot) + exponent + decimalPlaces;
	const padded = cut < 0 ? `${'0'.repeat(-cut)}${digits}` : digits.padEnd(cut, '0');
	const end = Math.max(cut, 0);
	let minor = Number.parseInt(padded.slice(0, end) || '0', 10);
	// Round half values away from zero: the sign is applied after rounding.
	if ((padded[end] ?? '') >= '5') minor++;
	const result = sign * minor;
	return Number.isSafeInteger(result) ? result : NaN;
}

/**
 * Convert integer minor units back to a major-unit decimal (for display only).
 * Non-integer input is defensively rounded so a slipped-through float can't
 * blow up the UI; the unit test in `money.test.ts` covers the strict path.
 */
export function toMajor(amountMinor: number, currency: string): number {
	if (!Number.isFinite(amountMinor)) return NaN;
	const dp = getCurrencyDecimalPlaces(currency);
	return Math.round(amountMinor) / 10 ** dp;
}
