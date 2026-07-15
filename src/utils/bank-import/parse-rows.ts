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
			const debit = parseDecimalToMinor(cells[mapping.amount.debitColumn] ?? '', mapping.decimalSeparator);
			const credit = parseDecimalToMinor(cells[mapping.amount.creditColumn] ?? '', mapping.decimalSeparator);
			if (debit && debit !== 0) amountMinor = -Math.abs(debit);
			else if (credit && credit !== 0) amountMinor = Math.abs(credit);
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
