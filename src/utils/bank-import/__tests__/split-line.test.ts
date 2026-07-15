import { describe, it, expect } from 'bun:test';
import { splitCsvLine, parseCsvLine } from '@/src/utils/import';

describe('splitCsvLine', () => {
	it('splits on a custom semicolon delimiter', () => {
		expect(splitCsvLine('a;b;c', ';')).toEqual(['a', 'b', 'c']);
	});
	it('honors quoted fields containing the delimiter', () => {
		expect(splitCsvLine('"x;y";z', ';')).toEqual(['x;y', 'z']);
	});
	it('parseCsvLine still splits on comma (regression)', () => {
		expect(parseCsvLine('"a,b",c')).toEqual(['a,b', 'c']);
	});
});
