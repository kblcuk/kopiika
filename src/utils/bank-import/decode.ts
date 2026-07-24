// Fallback text decoding for bank-statement CSVs that aren't valid UTF-8.
//
// The import screen decodes UTF-8 (incl. a UTF-8 BOM) natively via
// `File.text()`; that throws when the bytes aren't valid UTF-8. This module
// covers what's left with a single principled path instead of a special case
// per bank: sniff a UTF-16 byte-order mark, otherwise decode as Windows-1252.
//
// Windows-1252 is a strict superset of ISO-8859-1 — it fills the 0x80–0x9F
// range (€, curly quotes, en/em dash, …) that Nordic and Western banks actually
// emit — so it subsumes essentially every single-byte Western encoding a bank
// export uses. Danske Bank, for example, exports Finnish statements as
// ISO-8859-1, where ä (0xE4) and ö (0xF6) are single high bytes.
//
// Everything here is hand-rolled: React Native 0.83 (Hermes) ships no
// TextDecoder polyfill, so relying on it passes under Node/jest but crashes on
// device — the same trap as crypto.randomUUID.

export type FallbackEncoding = 'utf-16le' | 'utf-16be' | 'windows-1252';

// String.fromCharCode(...arr) on a large array overflows the call stack, so we
// flush code units in bounded chunks.
const CHUNK = 8192;

function flushChunks(units: number[]): string {
	let out = '';
	for (let i = 0; i < units.length; i += CHUNK) {
		out += String.fromCharCode.apply(null, units.slice(i, i + CHUNK));
	}
	return out;
}

// The 0x80–0x9F code points where Windows-1252 diverges from ISO-8859-1. Bytes
// omitted here (0x81, 0x8D, 0x8F, 0x90, 0x9D) are undefined in 1252; we pass
// them through unchanged rather than dropping data.
const CP1252_HIGH: Record<number, number> = {
	0x80: 0x20ac,
	0x82: 0x201a,
	0x83: 0x0192,
	0x84: 0x201e,
	0x85: 0x2026,
	0x86: 0x2020,
	0x87: 0x2021,
	0x88: 0x02c6,
	0x89: 0x2030,
	0x8a: 0x0160,
	0x8b: 0x2039,
	0x8c: 0x0152,
	0x8e: 0x017d,
	0x91: 0x2018,
	0x92: 0x2019,
	0x93: 0x201c,
	0x94: 0x201d,
	0x95: 0x2022,
	0x96: 0x2013,
	0x97: 0x2014,
	0x98: 0x02dc,
	0x99: 0x2122,
	0x9a: 0x0161,
	0x9b: 0x203a,
	0x9c: 0x0153,
	0x9e: 0x017e,
	0x9f: 0x0178,
};

export function decodeWindows1252(bytes: Uint8Array): string {
	const units: number[] = new Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i]!;
		units[i] = b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b] ?? b) : b;
	}
	return flushChunks(units);
}

// Decode raw UTF-16 code units (no BOM — caller strips it). Passing code units
// straight to String.fromCharCode reconstructs surrogate pairs for astral
// characters automatically.
export function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
	const count = bytes.length >> 1;
	const units: number[] = new Array(count);
	for (let i = 0; i < count; i++) {
		const lo = bytes[i * 2]!;
		const hi = bytes[i * 2 + 1]!;
		units[i] = littleEndian ? lo | (hi << 8) : (lo << 8) | hi;
	}
	return flushChunks(units);
}

// Decode bytes that `File.text()` rejected as non-UTF-8. Returns the resolved
// text plus the encoding we assumed, so callers can tailor error messaging.
export function decodeFallback(bytes: Uint8Array): { text: string; encoding: FallbackEncoding } {
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return { text: decodeUtf16(bytes.subarray(2), true), encoding: 'utf-16le' };
	}
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return { text: decodeUtf16(bytes.subarray(2), false), encoding: 'utf-16be' };
	}
	return { text: decodeWindows1252(bytes), encoding: 'windows-1252' };
}
