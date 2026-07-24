import { describe, it, expect } from 'bun:test';
import { decodeWindows1252, decodeUtf16, decodeFallback } from '../decode';

describe('decodeWindows1252', () => {
	it('maps ISO-8859-1 high bytes to their Unicode code points', () => {
		// "Insinööri" as Danske Bank exports it: ö = 0xF6.
		const bytes = new Uint8Array([0x49, 0x6e, 0x73, 0x69, 0x6e, 0xf6, 0xf6, 0x72, 0x69]);
		expect(decodeWindows1252(bytes)).toBe('Insinööri');
	});

	it('decodes ä (0xE4) and ö (0xF6) together', () => {
		// "Isännöinti"
		const bytes = new Uint8Array([0x49, 0x73, 0xe4, 0x6e, 0x6e, 0xf6, 0x69, 0x6e, 0x74, 0x69]);
		expect(decodeWindows1252(bytes)).toBe('Isännöinti');
	});

	it('maps the 0x80-0x9F range where 1252 differs from Latin-1', () => {
		// € (0x80), curly apostrophe (0x92), en dash (0x96), em dash (0x97).
		expect(decodeWindows1252(new Uint8Array([0x80]))).toBe('€');
		expect(decodeWindows1252(new Uint8Array([0x92]))).toBe('’');
		expect(decodeWindows1252(new Uint8Array([0x96]))).toBe('–');
		expect(decodeWindows1252(new Uint8Array([0x97]))).toBe('—');
	});

	it('passes bytes undefined in 1252 through unchanged', () => {
		// 0x81 has no 1252 mapping.
		expect(decodeWindows1252(new Uint8Array([0x81]))).toBe('');
	});

	it('leaves plain ASCII unchanged', () => {
		const bytes = new Uint8Array([0x22, 0x44, 0x61, 0x74, 0x65, 0x22]);
		expect(decodeWindows1252(bytes)).toBe('"Date"');
	});

	it('handles inputs larger than the chunk size without truncation', () => {
		const bytes = new Uint8Array(70000).fill(0xe4); // 'ä'
		const out = decodeWindows1252(bytes);
		expect(out.length).toBe(70000);
		expect(out[0]).toBe('ä');
		expect(out[out.length - 1]).toBe('ä');
	});
});

describe('decodeUtf16', () => {
	it('decodes little-endian code units', () => {
		// "Isä" = 0x49 0x73 0xE4, each as a 2-byte LE unit.
		const bytes = new Uint8Array([0x49, 0x00, 0x73, 0x00, 0xe4, 0x00]);
		expect(decodeUtf16(bytes, true)).toBe('Isä');
	});

	it('decodes big-endian code units', () => {
		const bytes = new Uint8Array([0x00, 0x49, 0x00, 0x73, 0x00, 0xe4]);
		expect(decodeUtf16(bytes, false)).toBe('Isä');
	});

	it('reconstructs surrogate pairs for astral characters', () => {
		// U+1F4B0 (💰) = surrogate pair D83D DCB0, little-endian.
		const bytes = new Uint8Array([0x3d, 0xd8, 0xb0, 0xdc]);
		expect(decodeUtf16(bytes, true)).toBe('💰');
	});
});

describe('decodeFallback', () => {
	it('sniffs a UTF-16LE BOM and decodes the remainder', () => {
		const bytes = new Uint8Array([0xff, 0xfe, 0x49, 0x00, 0x73, 0x00, 0xe4, 0x00]);
		expect(decodeFallback(bytes)).toEqual({ text: 'Isä', encoding: 'utf-16le' });
	});

	it('sniffs a UTF-16BE BOM and decodes the remainder', () => {
		const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x49, 0x00, 0x73, 0x00, 0xe4]);
		expect(decodeFallback(bytes)).toEqual({ text: 'Isä', encoding: 'utf-16be' });
	});

	it('falls back to Windows-1252 when there is no BOM', () => {
		// Danske Bank's "Insinööri" — no BOM, ISO-8859-1/1252 high bytes.
		const bytes = new Uint8Array([0x49, 0x6e, 0x73, 0x69, 0x6e, 0xf6, 0xf6, 0x72, 0x69]);
		expect(decodeFallback(bytes)).toEqual({ text: 'Insinööri', encoding: 'windows-1252' });
	});
});
