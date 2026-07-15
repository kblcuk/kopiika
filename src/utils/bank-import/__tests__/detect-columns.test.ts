import { describe, it, expect } from 'bun:test';
import { detectColumns } from '../detect-columns';

const ISO_SIGNED = `Date,Description,Amount
2026-07-12,ATB Market,-250.00
2026-07-11,Salary,15000.00`;

const EU_SEMICOLON = `Дата;Опис;Сума
12.07.2026;АТБ;-250,00
11.07.2026;Зарплата;15 000,00`;

const DEBIT_CREDIT = `Date,Details,Debit,Credit
2026-07-12,ATB,250.00,
2026-07-11,Salary,,15000.00`;

describe('detectColumns', () => {
	it('detects comma + ISO date + single signed amount', () => {
		const r = detectColumns(ISO_SIGNED)!;
		expect(r.mapping.delimiter).toBe(',');
		expect(r.mapping.hasHeader).toBe(true);
		expect(r.mapping.dateColumn).toBe(0);
		expect(r.mapping.dateFormat).toBe('YYYY-MM-DD');
		expect(r.mapping.amount).toEqual({ kind: 'signed', column: 2 });
		expect(r.mapping.decimalSeparator).toBe('.');
		expect(r.mapping.descriptionColumn).toBe(1);
		expect(r.confident).toEqual({ date: true, amount: true });
	});

	it('detects semicolon + DD.MM.YYYY + comma decimals', () => {
		const r = detectColumns(EU_SEMICOLON)!;
		expect(r.mapping.delimiter).toBe(';');
		expect(r.mapping.dateFormat).toBe('DD.MM.YYYY');
		expect(r.mapping.decimalSeparator).toBe(',');
		expect(r.mapping.amount).toEqual({ kind: 'signed', column: 2 });
	});

	it('detects separate debit/credit columns', () => {
		const r = detectColumns(DEBIT_CREDIT)!;
		expect(r.mapping.amount).toEqual({ kind: 'debitCredit', debitColumn: 2, creditColumn: 3 });
	});

	it('returns null on empty input', () => {
		expect(detectColumns('')).toBeNull();
	});
});
