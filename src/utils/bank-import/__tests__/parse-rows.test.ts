import { describe, it, expect } from 'bun:test';
import { parseBankRows } from '../parse-rows';
import type { ColumnMapping } from '../types';

const SIGNED: ColumnMapping = {
	delimiter: ',',
	hasHeader: true,
	dateColumn: 0,
	dateFormat: 'YYYY-MM-DD',
	decimalSeparator: '.',
	amount: { kind: 'signed', column: 2 },
	descriptionColumn: 1,
};

describe('parseBankRows (signed)', () => {
	const csv = `Date,Description,Amount
2026-07-12,ATB Market,-250.00
2026-07-11,Salary,15000.00
2026-07-10,Zero,0.00
bad-date,Broken,10.00`;
	const { rows, skipped } = parseBankRows(csv, SIGNED, 'EUR');

	it('parses valid signed rows with correct sign and minor units', () => {
		expect(rows).toEqual([
			{
				rowIndex: 0,
				dateMs: new Date(2026, 6, 12).getTime(),
				amountMinor: -25000,
				description: 'ATB Market',
			},
			{
				rowIndex: 1,
				dateMs: new Date(2026, 6, 11).getTime(),
				amountMinor: 1500000,
				description: 'Salary',
			},
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
		delimiter: ',',
		hasHeader: true,
		dateColumn: 0,
		dateFormat: 'YYYY-MM-DD',
		decimalSeparator: '.',
		amount: { kind: 'debitCredit', debitColumn: 2, creditColumn: 3 },
		descriptionColumn: 1,
	};
	const csv = `Date,Details,Debit,Credit
2026-07-12,ATB,250.00,
2026-07-11,Salary,,15000.00`;
	it('makes debit negative and credit positive', () => {
		const { rows } = parseBankRows(csv, mapping, 'EUR');
		expect(rows.map((r) => r.amountMinor)).toEqual([-25000, 1500000]);
	});

	it('skips rows where both debit and credit are unparseable', () => {
		const badCsv = `Date,Details,Debit,Credit
2026-07-12,ATB,abc,xyz`;
		const { rows, skipped } = parseBankRows(badCsv, mapping, 'EUR');
		expect(rows).toEqual([]);
		expect(skipped).toEqual([
			{ rowIndex: 0, reason: 'unparseable amount', raw: '2026-07-12,ATB,abc,xyz' },
		]);
	});

	it('skips rows where both debit and credit are populated non-zero', () => {
		const ambiguousCsv = `Date,Details,Debit,Credit
2026-07-12,ATB,250.00,100.00`;
		const { rows, skipped } = parseBankRows(ambiguousCsv, mapping, 'EUR');
		expect(rows).toEqual([]);
		expect(skipped).toEqual([
			{ rowIndex: 0, reason: 'ambiguous debit/credit', raw: '2026-07-12,ATB,250.00,100.00' },
		]);
	});
});

describe('parseBankRows currency precision', () => {
	const mapping: ColumnMapping = {
		...SIGNED,
		hasHeader: false,
		amount: { kind: 'signed', column: 2 },
	};

	it('uses zero decimal places for JPY', () => {
		const { rows } = parseBankRows('2026-07-12,Market,1234', mapping, 'JPY');
		expect(rows[0]?.amountMinor).toBe(1234);
	});

	it('uses three decimal places for BHD', () => {
		const { rows } = parseBankRows('2026-07-12,Market,1.234', mapping, 'BHD');
		expect(rows[0]?.amountMinor).toBe(1234);
	});
});
