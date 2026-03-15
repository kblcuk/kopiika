export function normalizeNumericInput(value: string): string {
	if (!value) return value;

	const isNegative = value.startsWith('-');
	const unsignedValue = isNegative ? value.slice(1) : value;

	if (!unsignedValue) return value;
	if (unsignedValue.startsWith('0.') || unsignedValue.startsWith('0,')) return value;

	const normalized = unsignedValue.replace(/^0+(?=\d)/, '');
	const nextValue = normalized || '0';

	return `${isNegative ? '-' : ''}${nextValue}`;
}
