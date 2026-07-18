import type { DateFormat } from './types';

const DATE_PARSERS: Record<DateFormat, RegExp> = {
	'YYYY-MM-DD': /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
	'DD.MM.YYYY': /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
	'DD/MM/YYYY': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
	'MM/DD/YYYY': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
};

function toMs(year: number, month1: number, day: number): number | null {
	if (month1 < 1 || month1 > 12 || day < 1 || day > 31) return null;
	const d = new Date(year, month1 - 1, day);
	// Reject overflow (e.g. Feb 30 rolls to March).
	if (d.getFullYear() !== year || d.getMonth() !== month1 - 1 || d.getDate() !== day) return null;
	return d.getTime();
}

export function parseFlexibleDate(value: string, format: DateFormat): number | null {
	// Bank exports often carry a timestamp on the date column (e.g. Revolut's
	// "2026-06-01 12:30:34" or ISO "2026-06-01T12:30:34Z"). We key on the civil
	// date only, so drop any trailing time component (space- or T-separated)
	// before matching. All four date formats are themselves whitespace-free, so
	// taking the token before the first space/T never truncates a valid date.
	const datePart = value.trim().split(/[ T]/)[0] ?? '';
	const m = datePart.match(DATE_PARSERS[format]);
	if (!m) return null;
	if (format === 'YYYY-MM-DD') return toMs(+m[1]!, +m[2]!, +m[3]!);
	if (format === 'DD.MM.YYYY') return toMs(+m[3]!, +m[2]!, +m[1]!);
	if (format === 'DD/MM/YYYY') return toMs(+m[3]!, +m[2]!, +m[1]!);
	return toMs(+m[3]!, +m[1]!, +m[2]!); // MM/DD/YYYY
}

export function parseDecimalToMinor(
	value: string,
	decimalSeparator: '.' | ',',
	fractionDigits = 2
): number | null {
	// Normalize unicode minus, strip everything except digits, separators, sign.
	let s = value.replace(/−/g, '-').trim();
	const negative = /-/.test(s);
	const thousands = decimalSeparator === '.' ? ',' : '.';
	s = s.split(thousands).join(''); // drop thousands separators
	s = s.replace(decimalSeparator, '.'); // canonical decimal point
	s = s.replace(/[^0-9.]/g, ''); // drop currency symbols, spaces, sign
	if (!/[0-9]/.test(s)) return null;
	const num = Number.parseFloat(s);
	if (!Number.isFinite(num)) return null;
	const minor = Math.round(num * 10 ** fractionDigits);
	return negative ? -minor : minor;
}
