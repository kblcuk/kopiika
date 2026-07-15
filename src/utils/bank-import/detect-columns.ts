import { splitCsvLine } from '@/src/utils/import';
import { parseFlexibleDate, parseDecimalToMinor } from './formats';
import type { DateFormat, DetectionResult } from './types';

const DELIMITERS = [',', ';', '\t'];
const DATE_FORMATS: DateFormat[] = ['YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'];

// "Word" characters for hint-boundary purposes: Latin letters/digits/underscore
// plus the full Cyrillic block (covers Russian + Ukrainian letters, e.g. і/ї/є/ґ).
// Deliberately NOT using \b or \p{L}: \b treats Cyrillic letters as non-word
// chars (so `\bсума\b` fails to match "Сума" in some engines), and \p{...}
// unicode property escapes need the `u` flag, which is best avoided for an
// on-device (Hermes) runtime. A plain character class works everywhere.
const WORD_CHARS = 'A-Za-z0-9_\\u0400-\\u04FF';

/**
 * Builds a case-insensitive hint regex that only matches `pattern` on a word
 * boundary (so `/sum/` doesn't false-match inside "Consumer", `/time/` doesn't
 * false-match inside "Runtime" — see review finding M5).
 */
function hintRegex(pattern: string): RegExp {
	return new RegExp(`(?:^|[^${WORD_CHARS}])(?:${pattern})(?=$|[^${WORD_CHARS}])`, 'i');
}

const DATE_HINTS = hintRegex('date|дата|время|time|posted|дата операції');
const AMOUNT_HINTS = hintRegex('amount|sum|сума|сумма|value|total');
const DEBIT_HINTS = hintRegex('debit|витрати|дебет|withdrawal|outflow');
const CREDIT_HINTS = hintRegex('credit|надходження|кредит|deposit|inflow');

function splitLines(rawText: string): string[] {
	return rawText.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
}

function pickDelimiter(lines: string[]): string {
	let best = ',';
	let bestCount = -1;
	const firstLine = lines[0];
	if (firstLine === undefined) return best;
	for (const d of DELIMITERS) {
		const count = splitCsvLine(firstLine, d).length;
		if (count > bestCount) { bestCount = count; best = d; }
	}
	return best;
}

const SIGN_RE = /[-−]/;
// Exactly 1-2 trailing decimal digits (not a 3+ digit thousands group).
const DECIMAL_MARKER: Record<'.' | ',', RegExp> = {
	'.': /\.\d{1,2}(?!\d)/,
	',': /,\d{1,2}(?!\d)/,
};

/**
 * "Looks like money": has an explicit sign or a decimal-point marker (not a
 * bare digit run like a card number or reference id), AND parses cleanly.
 * Shared by header detection (I4) and amount-column scoring (C1) so a
 * description/reference/card-number column full of digits is never mistaken
 * for a monetary column just because it happens to parse as a number.
 */
function looksMonetary(value: string, decimalSeparator: '.' | ','): boolean {
	const v = value.trim();
	if (!v) return false;
	if (!SIGN_RE.test(v) && !DECIMAL_MARKER[decimalSeparator].test(v)) return false;
	return parseDecimalToMinor(v, decimalSeparator) !== null;
}

function looksDataLike(cell: string): boolean {
	const v = cell.trim();
	if (!v) return false;
	if (DATE_FORMATS.some((f) => parseFlexibleDate(v, f) !== null)) return true;
	return looksMonetary(v, '.') || looksMonetary(v, ',');
}

/**
 * A line is a header if none of its cells look like data (a date, or a
 * signed/decimal-marked number). Bare digit runs (card numbers, currency
 * codes) do NOT count as data-like, so they can't fold a real header row
 * into the data rows (finding I4).
 */
function looksLikeHeader(cells: string[]): boolean {
	return !cells.some((c) => looksDataLike(c));
}

function scoreDateColumn(dataRows: string[][], col: number): { format: DateFormat; hits: number } | null {
	let best: { format: DateFormat; hits: number } | null = null;
	for (const format of DATE_FORMATS) {
		let hits = 0;
		for (const row of dataRows) if (row[col] && parseFlexibleDate(row[col], format) !== null) hits++;
		// DD/MM vs MM/DD tie-break: prefer the format that parses ALL rows; if
		// both do, prefer DD/MM (rest-of-world default for this app's market).
		if (hits > 0 && (!best || hits > best.hits)) best = { format, hits };
	}
	return best;
}

/**
 * Samples the decimal separator from the ACTUAL amount column(s) — never a
 * positional guess (e.g. "last column"), which can land on an unrelated
 * trailing Balance/currency column and silently corrupt money by 100x
 * (finding C2). For debit/credit splits, pass both columns: each row uses
 * whichever of the two is populated.
 */
function detectDecimalSeparator(dataRows: string[][], cols: number[]): '.' | ',' {
	for (const row of dataRows) {
		for (const c of cols) {
			const v = row[c] ?? '';
			if (/,\d{2}(?!\d)/.test(v) && !/\.\d{2}(?!\d)/.test(v)) return ',';
		}
	}
	return '.';
}

export function detectColumns(rawText: string): DetectionResult | null {
	const lines = splitLines(rawText);
	if (lines.length === 0) return null;

	const delimiter = pickDelimiter(lines);
	const rows = lines.map((l) => splitCsvLine(l, delimiter));
	const columnCount = Math.max(...rows.map((r) => r.length));
	const firstRow = rows[0];
	if (firstRow === undefined) return null;
	const hasHeader = looksLikeHeader(firstRow);
	const headerCells = hasHeader ? firstRow : firstRow.map((_, i) => `Column ${i + 1}`);
	const dataRows = hasHeader ? rows.slice(1) : rows;
	if (dataRows.length === 0) return null;

	// --- date column: value-shape (does it parse as a date?) is PRIMARY.
	// A header hint only breaks a tie among columns that already parse as
	// dates for the most rows; a hint on a column that doesn't parse as a
	// date is discarded (finding I3). ---
	const dateShapeByCol: ({ format: DateFormat; hits: number } | null)[] = [];
	let bestDateHits = 0;
	for (let c = 0; c < columnCount; c++) {
		const scored = scoreDateColumn(dataRows, c);
		dateShapeByCol[c] = scored;
		if (scored && scored.hits > bestDateHits) bestDateHits = scored.hits;
	}
	let dateColumn = -1;
	let dateFormat: DateFormat = 'YYYY-MM-DD';
	if (bestDateHits > 0) {
		const dateHintCol = hasHeader ? headerCells.findIndex((h) => DATE_HINTS.test(h)) : -1;
		if (dateHintCol >= 0 && (dateShapeByCol[dateHintCol]?.hits ?? 0) === bestDateHits) {
			dateColumn = dateHintCol;
			dateFormat = dateShapeByCol[dateHintCol]!.format;
		} else {
			for (let c = 0; c < columnCount; c++) {
				if (dateShapeByCol[c] && dateShapeByCol[c]!.hits === bestDateHits) {
					dateColumn = c;
					dateFormat = dateShapeByCol[c]!.format;
					break;
				}
			}
		}
	}
	const dateConfident = dateColumn >= 0 && bestDateHits === dataRows.length;
	if (dateColumn < 0) dateColumn = 0;

	// --- amount: value-shape is PRIMARY here too. "Strong" candidates have a
	// sign or decimal marker in (most) rows — i.e. actually look monetary, not
	// just "digits that happen to parse" (finding C1: a reference-number
	// column full of bare digits must lose to a real amount column). A header
	// hint only breaks a tie among the strongest-scoring columns (I3). ---
	const strongByCol: number[] = [];
	const weakByCol: number[] = [];
	for (let c = 0; c < columnCount; c++) {
		let strong = 0;
		let weak = 0;
		for (const row of dataRows) {
			const v = row[c] ?? '';
			if (looksMonetary(v, '.') || looksMonetary(v, ',')) strong++;
			else if (parseDecimalToMinor(v, '.') !== null || parseDecimalToMinor(v, ',') !== null) weak++;
		}
		strongByCol[c] = strong;
		weakByCol[c] = weak;
	}

	// Debit/credit header pair, verified: both columns must actually look
	// monetary (a sign or decimal marker in at least one row), not merely
	// parse as bare digits — a coincidental header match on a card-number or
	// score column (e.g. "Debit Card", "Credit Score") must not hijack a
	// genuinely strong signed Amount column elsewhere in the row (review
	// finding: debit/credit hijacks a strong signed Amount column).
	const debitHintCol = hasHeader ? headerCells.findIndex((h) => DEBIT_HINTS.test(h)) : -1;
	const creditHintCol = hasHeader ? headerCells.findIndex((h) => CREDIT_HINTS.test(h)) : -1;
	const debitCreditValid =
		debitHintCol >= 0 &&
		creditHintCol >= 0 &&
		debitHintCol !== creditHintCol &&
		debitHintCol !== dateColumn &&
		creditHintCol !== dateColumn &&
		(strongByCol[debitHintCol] ?? 0) > 0 &&
		(strongByCol[creditHintCol] ?? 0) > 0;

	let amount: DetectionResult['mapping']['amount'];
	let amountConfident: boolean;
	let decimalSeparator: '.' | ',';

	if (debitCreditValid) {
		amount = { kind: 'debitCredit', debitColumn: debitHintCol, creditColumn: creditHintCol };
		decimalSeparator = detectDecimalSeparator(dataRows, [debitHintCol, creditHintCol]);
		amountConfident = dataRows.every((row) => {
			const d = (row[debitHintCol] ?? '').trim();
			const c = (row[creditHintCol] ?? '').trim();
			const dEmpty = d === '';
			const cEmpty = c === '';
			// Exactly one side populated per row, and it parses.
			return (
				dEmpty !== cEmpty &&
				(dEmpty || parseDecimalToMinor(d, decimalSeparator) !== null) &&
				(cEmpty || parseDecimalToMinor(c, decimalSeparator) !== null)
			);
		});
	} else {
		let bestStrong = 0;
		for (let c = 0; c < columnCount; c++) {
			const strong = strongByCol[c] ?? 0;
			if (c !== dateColumn && strong > bestStrong) bestStrong = strong;
		}

		let col = -1;
		if (bestStrong > 0) {
			const hintCol = hasHeader ? headerCells.findIndex((h) => AMOUNT_HINTS.test(h)) : -1;
			if (hintCol >= 0 && hintCol !== dateColumn && (strongByCol[hintCol] ?? 0) === bestStrong) {
				col = hintCol;
			} else {
				for (let c = 0; c < columnCount; c++) {
					if (c !== dateColumn && (strongByCol[c] ?? 0) === bestStrong) { col = c; break; }
				}
			}
		} else {
			// No column shows monetary shape at all — fall back to the column
			// with the most bare-numeric hits, but this is always a weak guess
			// (never confident): a column of plain digits (card numbers,
			// reference ids) is not verified as an amount (C1).
			let bestWeak = 0;
			for (let c = 0; c < columnCount; c++) {
				const weak = weakByCol[c] ?? 0;
				if (c !== dateColumn && weak > bestWeak) { bestWeak = weak; col = c; }
			}
		}
		if (col < 0) {
			col = 0;
			for (let c = 0; c < columnCount; c++) if (c !== dateColumn) { col = c; break; }
		}

		amount = { kind: 'signed', column: col };
		decimalSeparator = detectDecimalSeparator(dataRows, [col]);
		if (amount.kind === 'signed') {
			const amountColumn = amount.column;
			amountConfident =
				bestStrong > 0 &&
				amountColumn !== dateColumn &&
				dataRows.every((row) => looksMonetary(row[amountColumn] ?? '', decimalSeparator));
		} else {
			amountConfident = false;
		}
	}

	const usedCols = new Set<number>([dateColumn]);
	if (amount.kind === 'signed') usedCols.add(amount.column);
	else { usedCols.add(amount.debitColumn); usedCols.add(amount.creditColumn); }
	let descriptionColumn: number | null = null;
	for (let c = 0; c < columnCount; c++) if (!usedCols.has(c)) { descriptionColumn = c; break; }

	return {
		mapping: { delimiter, hasHeader, dateColumn, dateFormat, decimalSeparator, amount, descriptionColumn },
		confident: { date: dateConfident, amount: amountConfident },
		headers: headerCells,
		columnCount,
	};
}
