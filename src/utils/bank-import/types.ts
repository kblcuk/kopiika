export type DateFormat = 'YYYY-MM-DD' | 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY';

export type AmountMapping =
	| { kind: 'signed'; column: number }
	| { kind: 'debitCredit'; debitColumn: number; creditColumn: number };

export interface ColumnMapping {
	delimiter: string;
	hasHeader: boolean;
	dateColumn: number;
	dateFormat: DateFormat;
	decimalSeparator: '.' | ',';
	amount: AmountMapping;
	descriptionColumn: number | null;
}

export interface DetectionResult {
	mapping: ColumnMapping;
	/** field -> confident? Lets the UI flag guesses the user should check. */
	confident: { date: boolean; amount: boolean };
	headers: string[]; // column labels (header row, or "Column 1"… if none)
	columnCount: number;
}

export interface ParsedBankRow {
	rowIndex: number; // 0-based source data-row index (post-header), for stable keys
	dateMs: number;
	amountMinor: number; // signed: negative = outflow, positive = inflow
	description: string;
}

export interface SkippedRow {
	rowIndex: number;
	reason: string;
	raw: string;
}

export type Assignment =
	| { kind: 'category'; entityId: string }
	| { kind: 'newCategory'; name: string }
	| { kind: 'income'; entityId: string }
	| { kind: 'transfer'; accountId: string };

export interface ReconciledRow {
	parsed: ParsedBankRow;
	status: 'duplicate' | 'new';
	selected: boolean; // duplicates default false; new default true
	assignment: Assignment | null;
	/** Suggested transfer counterparty accountId, if description matched one. */
	suggestedTransferAccountId?: string;
}
