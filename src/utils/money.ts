// KII-120: Money is stored as integer minor units (cents for EUR, etc.) on
// every DB column and in every in-memory `Transaction.amount_minor` /
// `Plan.planned_amount_minor` / `RecurrenceTemplate.amount_minor` /
// `MarketValueSnapshot.amount_minor` field.
//
// Convert at the UI boundary only:
//   user input string  → reverseFormatCurrency → toMinor → DB write
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
 * (e.g. 4321 for EUR). `Math.round` absorbs accumulated float drift like
 * `43.21000000001 * 100 = 4321.000000001`. Returns NaN for non-finite input.
 */
export function toMinor(amountMajor: number, currency: string): number {
	if (!Number.isFinite(amountMajor)) return NaN;
	const dp = getCurrencyDecimalPlaces(currency);
	return Math.round(amountMajor * 10 ** dp);
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
