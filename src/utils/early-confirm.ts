import { isDue } from './due';

export interface EarlyConfirmPrompt {
	scheduledLabel: string;
	todayLabel: string;
}

/** Same format as the scheduled-date line on an upcoming transaction row. */
function formatConfirmDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	});
}

/**
 * Whether confirming `timestamp` needs the early-confirm dialog, and the labels
 * that dialog names.
 *
 * Null means the transaction is already due — that confirm is a single tap.
 * Confirming AHEAD of the scheduled date rewrites the transaction's date to
 * today and cannot be undone (there is no unconfirm operation), so it is worth
 * one dialog (KII-159).
 */
export function earlyConfirmPrompt(timestamp: number, now: number): EarlyConfirmPrompt | null {
	if (isDue(timestamp, now)) return null;
	return {
		scheduledLabel: formatConfirmDate(timestamp),
		todayLabel: formatConfirmDate(now),
	};
}
