import { describe, test, expect } from 'bun:test';
import { csvRow, parseCsv } from '../csv';

describe('parseCsv', () => {
	test('splits records on LF, CRLF and CR', () => {
		expect(parseCsv('a,b\nc,d\r\ne,f\rg,h')).toEqual([
			['a', 'b'],
			['c', 'd'],
			['e', 'f'],
			['g', 'h'],
		]);
	});

	test('handles quoted delimiters, escaped quotes and empty fields', () => {
		expect(parseCsv('a,"hello, world","say ""hi""",,""')).toEqual([
			['a', 'hello, world', 'say "hi"', '', ''],
		]);
	});

	test('keeps line breaks inside quoted fields', () => {
		expect(parseCsv('id,note\n1,"line one\nline two\r\nline three"\n2,x')).toEqual([
			['id', 'note'],
			['1', 'line one\nline two\r\nline three'],
			['2', 'x'],
		]);
	});

	test('keeps a quote that does not open its field literal', () => {
		expect(parseCsv('a,5" pizza,Joe\'s "Bar"\nd,e,f')).toEqual([
			['a', '5" pizza', 'Joe\'s "Bar"'],
			['d', 'e', 'f'],
		]);
	});

	test('honors a custom delimiter', () => {
		expect(parseCsv('a;b;c\n"x;y";z', ';')).toEqual([
			['a', 'b', 'c'],
			['x;y', 'z'],
		]);
	});

	test('drops blank lines and a leading BOM', () => {
		expect(parseCsv('\uFEFFa,b\n\n   \nc,d\n')).toEqual([
			['a', 'b'],
			['c', 'd'],
		]);
	});

	test('stops after maxRecords', () => {
		expect(parseCsv('a,b\nc,d\ne,f', ',', 1)).toEqual([['a', 'b']]);
	});
});

describe('csvRow', () => {
	test('quotes only the fields that need it', () => {
		expect(csvRow(['plain', 'a,b', 'say "hi"', 'two\nlines', 'cr\r'])).toBe(
			'plain,"a,b","say ""hi""","two\nlines","cr\r"'
		);
	});

	test('writes null and undefined as empty, other values via String', () => {
		expect(csvRow([null, undefined, 0, true, 1.5])).toBe(',,0,true,1.5');
	});

	test('round-trips through parseCsv', () => {
		const fields = ['x', 'a,b', '"quoted"', 'multi\nline\r\nnote', '# ENTITIES', ''];
		expect(parseCsv(csvRow(fields))).toEqual([fields]);
	});
});
