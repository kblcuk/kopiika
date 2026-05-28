const cache = new Map<string, number>();

export function getCurrencyDecimalPlaces(currency: string): number {
	const cached = cache.get(currency);
	if (cached !== undefined) return cached;
	try {
		// ECMA-402 guarantees maximumFractionDigits is defined when style:'currency'
		// is used, so the non-null assertion is safe here.
		const dp = new Intl.NumberFormat('en', {
			style: 'currency',
			currency,
		}).resolvedOptions().maximumFractionDigits!;
		cache.set(currency, dp);
		return dp;
	} catch {
		return 2;
	}
}
