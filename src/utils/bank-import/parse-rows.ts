import { parseCsv } from '../csv';
import { getCurrencyDecimalPlaces } from '../currency-precision';
import { parseFlexibleDate, parseDecimalToMinor } from './formats';
import type { ColumnMapping, ParsedBankRow, SkippedRow } from './types';

export function parseBankRows(
	rawText: string,
	mapping: ColumnMapping,
	currency: string
): { rows: ParsedBankRow[]; skipped: SkippedRow[] } {
	const fractionDigits = getCurrencyDecimalPlaces(currency);
	const records = parseCsv(rawText, mapping.delimiter);
	const dataRows = mapping.hasHeader ? records.slice(1) : records;
	const rows: ParsedBankRow[] = [];
	const skipped: SkippedRow[] = [];

	dataRows.forEach((cells, rowIndex) => {
		const skip = (reason: string) =>
			skipped.push({ rowIndex, reason, raw: cells.join(mapping.delimiter) });

		const dateMs = parseFlexibleDate(cells[mapping.dateColumn] ?? '', mapping.dateFormat);
		if (dateMs === null) {
			skip('unparseable date');
			return;
		}

		let amountMinor: number | null;
		if (mapping.amount.kind === 'signed') {
			amountMinor = parseDecimalToMinor(
				cells[mapping.amount.column] ?? '',
				mapping.decimalSeparator,
				fractionDigits
			);
		} else {
			// Sign convention: for debit/credit columns the COLUMN (not the cell's own sign)
			// determines direction — debit = outflow (negative), credit = inflow (positive).
			// Parsed values are treated as magnitudes via Math.abs by design.
			const debit = parseDecimalToMinor(
				cells[mapping.amount.debitColumn] ?? '',
				mapping.decimalSeparator,
				fractionDigits
			);
			const credit = parseDecimalToMinor(
				cells[mapping.amount.creditColumn] ?? '',
				mapping.decimalSeparator,
				fractionDigits
			);
			if (debit === null && credit === null) {
				skip('unparseable amount');
				return;
			}
			const debitSet = debit !== null && debit !== 0;
			const creditSet = credit !== null && credit !== 0;
			if (debitSet && creditSet) {
				skip('ambiguous debit/credit');
				return;
			}
			if (debitSet) amountMinor = -Math.abs(debit as number);
			else if (creditSet) amountMinor = Math.abs(credit as number);
			else amountMinor = 0;
		}
		if (amountMinor === null) {
			skip('unparseable amount');
			return;
		}
		if (amountMinor === 0) {
			skip('zero amount');
			return;
		}

		const description =
			mapping.descriptionColumn !== null
				? (cells[mapping.descriptionColumn] ?? '').trim()
				: '';
		rows.push({ rowIndex, dateMs, amountMinor, description });
	});

	return { rows, skipped };
}
