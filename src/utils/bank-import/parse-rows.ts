import { splitCsvLine } from '@/src/utils/import';
import { parseFlexibleDate, parseDecimalToMinor } from './formats';
import type { ColumnMapping, ParsedBankRow, SkippedRow } from './types';

export function parseBankRows(
	rawText: string,
	mapping: ColumnMapping
): { rows: ParsedBankRow[]; skipped: SkippedRow[] } {
	const lines = rawText.replace(/^﻿/, '').split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
	const dataLines = mapping.hasHeader ? lines.slice(1) : lines;
	const rows: ParsedBankRow[] = [];
	const skipped: SkippedRow[] = [];

	dataLines.forEach((line, rowIndex) => {
		const cells = splitCsvLine(line, mapping.delimiter);
		const dateMs = parseFlexibleDate(cells[mapping.dateColumn] ?? '', mapping.dateFormat);
		if (dateMs === null) { skipped.push({ rowIndex, reason: 'unparseable date', raw: line }); return; }

		let amountMinor: number | null;
		if (mapping.amount.kind === 'signed') {
			amountMinor = parseDecimalToMinor(cells[mapping.amount.column] ?? '', mapping.decimalSeparator);
		} else {
			// Sign convention: for debit/credit columns the COLUMN (not the cell's own sign)
			// determines direction — debit = outflow (negative), credit = inflow (positive).
			// Parsed values are treated as magnitudes via Math.abs by design.
			const debit = parseDecimalToMinor(cells[mapping.amount.debitColumn] ?? '', mapping.decimalSeparator);
			const credit = parseDecimalToMinor(cells[mapping.amount.creditColumn] ?? '', mapping.decimalSeparator);
			if (debit === null && credit === null) {
				skipped.push({ rowIndex, reason: 'unparseable amount', raw: line });
				return;
			}
			const debitSet = debit !== null && debit !== 0;
			const creditSet = credit !== null && credit !== 0;
			if (debitSet && creditSet) {
				skipped.push({ rowIndex, reason: 'ambiguous debit/credit', raw: line });
				return;
			}
			if (debitSet) amountMinor = -Math.abs(debit as number);
			else if (creditSet) amountMinor = Math.abs(credit as number);
			else amountMinor = 0;
		}
		if (amountMinor === null) { skipped.push({ rowIndex, reason: 'unparseable amount', raw: line }); return; }
		if (amountMinor === 0) { skipped.push({ rowIndex, reason: 'zero amount', raw: line }); return; }

		const description =
			mapping.descriptionColumn !== null ? (cells[mapping.descriptionColumn] ?? '').trim() : '';
		rows.push({ rowIndex, dateMs, amountMinor, description });
	});

	return { rows, skipped };
}
