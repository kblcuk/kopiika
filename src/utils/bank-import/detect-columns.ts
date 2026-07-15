import { splitCsvLine } from '@/src/utils/import';
import { parseFlexibleDate, parseDecimalToMinor } from './formats';
import type { DateFormat, DetectionResult } from './types';

const DELIMITERS = [',', ';', '\t'];
const DATE_FORMATS: DateFormat[] = ['YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'];
const DATE_HINTS = /date|дата|время|time|posted|дата операції/i;
const AMOUNT_HINTS = /amount|sum|сума|сумма|value|total/i;
const DEBIT_HINTS = /debit|витрати|дебет|withdrawal|outflow/i;
const CREDIT_HINTS = /credit|надходження|кредит|deposit|inflow/i;

function splitLines(rawText: string): string[] {
	return rawText.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
}

function pickDelimiter(lines: string[]): string {
	let best = ',';
	let bestCount = -1;
	for (const d of DELIMITERS) {
		const count = splitCsvLine(lines[0], d).length;
		if (count > bestCount) { bestCount = count; best = d; }
	}
	return best;
}

/** A line is a header if none of its cells parse as a date or a number. */
function looksLikeHeader(cells: string[]): boolean {
	return !cells.some(
		(c) =>
			DATE_FORMATS.some((f) => parseFlexibleDate(c, f) !== null) ||
			parseDecimalToMinor(c, '.') !== null ||
			parseDecimalToMinor(c, ',') !== null
	);
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

function detectDecimalSeparator(dataRows: string[][], col: number): '.' | ',' {
	// If any value has a comma followed by exactly 2 trailing digits, it's a
	// comma-decimal locale; otherwise dot.
	for (const row of dataRows) {
		const v = row[col] ?? '';
		if (/,\d{2}\b/.test(v) && !/\.\d{2}\b/.test(v)) return ',';
	}
	return '.';
}

export function detectColumns(rawText: string): DetectionResult | null {
	const lines = splitLines(rawText);
	if (lines.length === 0) return null;

	const delimiter = pickDelimiter(lines);
	const rows = lines.map((l) => splitCsvLine(l, delimiter));
	const columnCount = Math.max(...rows.map((r) => r.length));
	const hasHeader = looksLikeHeader(rows[0]);
	const headerCells = hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`);
	const dataRows = hasHeader ? rows.slice(1) : rows;
	if (dataRows.length === 0) return null;

	// --- date column: header hint first, else best-scoring column ---
	let dateColumn = headerCells.findIndex((h) => hasHeader && DATE_HINTS.test(h));
	let dateFormat: DateFormat = 'YYYY-MM-DD';
	if (dateColumn >= 0) {
		dateFormat = scoreDateColumn(dataRows, dateColumn)?.format ?? 'YYYY-MM-DD';
	} else {
		let bestHits = 0;
		for (let c = 0; c < columnCount; c++) {
			const scored = scoreDateColumn(dataRows, c);
			if (scored && scored.hits > bestHits) { bestHits = scored.hits; dateColumn = c; dateFormat = scored.format; }
		}
	}
	const dateConfident = dateColumn >= 0 && (scoreDateColumn(dataRows, dateColumn)?.hits ?? 0) === dataRows.length;
	if (dateColumn < 0) dateColumn = 0;

	// --- amount: prefer debit/credit header pair, else numeric column ---
	const debitCol = hasHeader ? headerCells.findIndex((h) => DEBIT_HINTS.test(h)) : -1;
	const creditCol = hasHeader ? headerCells.findIndex((h) => CREDIT_HINTS.test(h)) : -1;
	const decimalSeparator = detectDecimalSeparator(dataRows, debitCol >= 0 ? debitCol : columnCount - 1);

	let amount: DetectionResult['mapping']['amount'];
	let amountConfident = false;
	if (debitCol >= 0 && creditCol >= 0) {
		amount = { kind: 'debitCredit', debitColumn: debitCol, creditColumn: creditCol };
		amountConfident = true;
	} else {
		// numeric column that is NOT the date column; header hint wins ties
		const hintCol = hasHeader ? headerCells.findIndex((h) => AMOUNT_HINTS.test(h)) : -1;
		let col = hintCol;
		if (col < 0 || col === dateColumn) {
			let bestHits = 0;
			for (let c = 0; c < columnCount; c++) {
				if (c === dateColumn) continue;
				let hits = 0;
				for (const row of dataRows) if (parseDecimalToMinor(row[c] ?? '', decimalSeparator) !== null) hits++;
				if (hits > bestHits) { bestHits = hits; col = c; }
			}
		}
		amount = { kind: 'signed', column: Math.max(col, 0) };
		amountConfident =
			amount.column !== dateColumn &&
			dataRows.every((row) => parseDecimalToMinor(row[amount.column] ?? '', decimalSeparator) !== null);
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
