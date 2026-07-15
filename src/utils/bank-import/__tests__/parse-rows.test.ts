import { describe, it, expect } from 'bun:test';
import { parseBankRows } from '../parse-rows';
import type { ColumnMapping } from '../types';

const SIGNED: ColumnMapping = {
	delimiter: ',', hasHeader: true, dateColumn: 0, dateFormat: 'YYYY-MM-DD',
	decimalSeparator: '.', amount: { kind: 'signed', column: 2 }, descriptionColumn: 1,
};

describe('parseBankRows (signed)', () => {
	const csv = `Date,Description,Amount
2026-07-12,ATB Market,-250.00
2026-07-11,Salary,15000.00
2026-07-10,Zero,0.00
bad-date,Broken,10.00`;
	const { rows, skipped } = parseBankRows(csv, SIGNED);

	it('parses valid signed rows with correct sign and minor units', () => {
		expect(rows).toEqual([
			{ rowIndex: 0, dateMs: new Date(2026, 6, 12).getTime(), amountMinor: -25000, description: 'ATB Market' },
			{ rowIndex: 1, dateMs: new Date(2026, 6, 11).getTime(), amountMinor: 1500000, description: 'Salary' },
		]);
	});
	it('skips zero-amount and unparseable-date rows with reasons', () => {
		expect(skipped).toEqual([
			{ rowIndex: 2, reason: 'zero amount', raw: '2026-07-10,Zero,0.00' },
			{ rowIndex: 3, reason: 'unparseable date', raw: 'bad-date,Broken,10.00' },
		]);
	});
});

describe('parseBankRows (debit/credit)', () => {
	const mapping: ColumnMapping = {
		delimiter: ',', hasHeader: true, dateColumn: 0, dateFormat: 'YYYY-MM-DD',
		decimalSeparator: '.', amount: { kind: 'debitCredit', debitColumn: 2, creditColumn: 3 }, descriptionColumn: 1,
	};
	const csv = `Date,Details,Debit,Credit
2026-07-12,ATB,250.00,
2026-07-11,Salary,,15000.00`;
	it('makes debit negative and credit positive', () => {
		const { rows } = parseBankRows(csv, mapping);
		expect(rows.map((r) => r.amountMinor)).toEqual([-25000, 1500000]);
	});
});
