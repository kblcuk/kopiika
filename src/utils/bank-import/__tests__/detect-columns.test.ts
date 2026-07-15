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

// C1 — a digit-heavy reference/description column ("Ref 4009812349") must
// lose to the real amount column, even with no matching header hint.
const REF_NUMBER_DESCRIPTION = `Дата,Опис,Операція
12.07.2026,Ref 4009812349,-250.00
11.07.2026,Ref 5511239001,15000.00`;

// C2 — a trailing Balance column (bare integers, no decimal marker) must not
// contaminate the decimal-separator sample for the real (comma-decimal)
// Amount column. Old code sampled from the last column positionally.
const TRAILING_BALANCE_COMMA_DECIMAL = `Date;Description;Amount;Balance
12.07.2026;ATB;-250,00;15000
11.07.2026;Salary;15000,00;30000`;

// I4 — a digit-bearing header cell ("Картка 5168745012345678") must not make
// looksLikeHeader() treat row 0 as a data row.
const DIGIT_BEARING_HEADER = `Дата;Опис;Картка 5168745012345678;Сума
12.07.2026;АТБ;1234;-250,00
11.07.2026;Зарплата;1234;15 000,00`;

// M5 — header hints must respect word boundaries: "Consumer" contains "sum"
// and must not out-rank "Amount" just because it comes first in column order.
// Both columns are monetary-shaped (a genuine tie), so only correct hint
// matching (not header order) should decide the winner.
const WORD_BOUNDARY_SUBSTRING = `Date,Consumer,Amount
2026-07-12,-99.00,-250.00
2026-07-11,-88.00,15000.00`;

// Review finding — debit/credit hijack: "Debit Card" and "Credit Score" match
// the debit/credit header hints, but neither column is actually monetary
// (bare digits: a card number and a score). The real signed Amount column
// must win instead.
const DEBIT_CREDIT_HIJACK = `Date,Description,Amount,Debit Card,Credit Score
2026-01-01,ATB,-100.00,4111,720
2026-01-02,Salary,50.00,4111,650`;

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

	// C1 regression
	it('does not mistake a digit-heavy reference/description column for amount', () => {
		const r = detectColumns(REF_NUMBER_DESCRIPTION)!;
		expect(r.mapping.delimiter).toBe(',');
		expect(r.mapping.hasHeader).toBe(true);
		expect(r.mapping.dateColumn).toBe(0);
		expect(r.mapping.dateFormat).toBe('DD.MM.YYYY');
		expect(r.mapping.amount).toEqual({ kind: 'signed', column: 2 });
		expect(r.mapping.decimalSeparator).toBe('.');
		expect(r.mapping.descriptionColumn).toBe(1);
		expect(r.confident).toEqual({ date: true, amount: true });
	});

	// C2 regression (highest priority — 100x money bug)
	it('samples decimalSeparator from the real amount column, not a trailing Balance column', () => {
		const r = detectColumns(TRAILING_BALANCE_COMMA_DECIMAL)!;
		expect(r.mapping.delimiter).toBe(';');
		expect(r.mapping.hasHeader).toBe(true);
		expect(r.mapping.dateColumn).toBe(0);
		expect(r.mapping.dateFormat).toBe('DD.MM.YYYY');
		expect(r.mapping.amount).toEqual({ kind: 'signed', column: 2 });
		expect(r.mapping.decimalSeparator).toBe(',');
		expect(r.confident).toEqual({ date: true, amount: true });
	});

	// I4 regression
	it('does not let a digit-bearing header cell fold the header row into data', () => {
		const r = detectColumns(DIGIT_BEARING_HEADER)!;
		expect(r.mapping.delimiter).toBe(';');
		expect(r.mapping.hasHeader).toBe(true);
		expect(r.mapping.dateColumn).toBe(0);
		expect(r.mapping.dateFormat).toBe('DD.MM.YYYY');
		expect(r.mapping.amount).toEqual({ kind: 'signed', column: 3 });
		expect(r.mapping.decimalSeparator).toBe(',');
		expect(r.confident).toEqual({ date: true, amount: true });
	});

	// M5 regression
	it('does not let "Consumer" out-rank "Amount" via substring match on "sum"', () => {
		const r = detectColumns(WORD_BOUNDARY_SUBSTRING)!;
		expect(r.mapping.delimiter).toBe(',');
		expect(r.mapping.hasHeader).toBe(true);
		expect(r.mapping.dateColumn).toBe(0);
		expect(r.mapping.dateFormat).toBe('YYYY-MM-DD');
		expect(r.mapping.amount).toEqual({ kind: 'signed', column: 2 });
		expect(r.mapping.decimalSeparator).toBe('.');
		expect(r.mapping.descriptionColumn).toBe(1);
		expect(r.confident).toEqual({ date: true, amount: true });
	});

	// Review finding regression: coincidental "Debit Card"/"Credit Score"
	// header hints on non-monetary (bare-digit) columns must not hijack a
	// genuinely strong signed Amount column.
	it('does not let coincidental debit/credit header hints on non-monetary columns hijack a strong signed amount column', () => {
		const r = detectColumns(DEBIT_CREDIT_HIJACK)!;
		expect(r.mapping.amount).toEqual({ kind: 'signed', column: 2 });
		expect(r.confident.amount).toBe(true);
	});
});
