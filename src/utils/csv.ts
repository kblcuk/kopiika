/**
 * CSV tokenizer shared by the backup restore (`import.ts`) and the bank
 * statement importer. It walks the whole text rather than splitting lines
 * first, so a quoted field may hold the delimiter, `""`-escaped quotes and
 * line breaks. Records end at an unquoted LF, CRLF or CR; blank lines and a
 * leading BOM are dropped. `maxRecords` stops early, for callers that only
 * sniff the first rows.
 */
export function parseCsv(text: string, delimiter = ',', maxRecords = Infinity): string[][] {
	const records: string[][] = [];
	let record: string[] = [];
	let field = '';
	let inQuotes = false;
	// Only a quote that opens a field starts quoting (RFC 4180). A stray one
	// mid-field, like `5" pizza` in a bank description, stays literal instead
	// of swallowing every record after it.
	let fieldStart = true;

	const endRecord = () => {
		record.push(field);
		const isBlank = record.length === 1 && field.trim() === '';
		if (!isBlank) records.push(record);
		record = [];
		field = '';
	};

	for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
		const ch = text[i];
		const atFieldStart = fieldStart;
		fieldStart = false;
		if (inQuotes) {
			if (ch !== '"') field += ch;
			else if (text[i + 1] === '"') {
				field += '"';
				i++;
			} else inQuotes = false;
		} else if (ch === '"' && atFieldStart) inQuotes = true;
		else if (ch === delimiter) {
			record.push(field);
			field = '';
			fieldStart = true;
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && text[i + 1] === '\n') i++;
			endRecord();
			fieldStart = true;
			if (records.length >= maxRecords) return records;
		} else field += ch;
	}
	endRecord();
	return records;
}

/**
 * Serialize one record. A field is quoted only when it holds a comma, quote
 * or line break, which is all `parseCsv` needs to read it back verbatim.
 * `null`/`undefined` become empty fields, matching `Array.prototype.join`.
 */
export function csvRow(values: readonly unknown[]): string {
	return values
		.map((value) => {
			const s = value == null ? '' : String(value);
			return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		})
		.join(',');
}
