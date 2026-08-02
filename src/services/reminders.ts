import type { Entity, Transaction } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	getRemindersEnabled,
	getScheduledReminderKey,
	setScheduledReminderKey,
} from '@/src/utils/app-prefs';
import { formatAmount } from '@/src/utils/format';
import { buildReminderSchedule } from './reminder-schedule';
import {
	cancelAllNotifications,
	scheduleTransactionNotification,
	setupNotificationChannel,
} from './notifications';

/** Everything the OS needs for one reminder — i.e. everything the user reads. */
type ReminderPayload = Parameters<typeof scheduleTransactionNotification>[0];

/**
 * Resolve the schedule into the exact payloads the OS will be handed: entity
 * names and the formatted amount, not just ids. Doing this before the
 * fingerprint is what makes content edits (amount, currency, a renamed entity)
 * visible to the guard below.
 */
function resolveReminderPayloads(
	templates: RecurrenceTemplate[],
	transactions: Transaction[],
	entities: Entity[],
	now: number
): ReminderPayload[] {
	const entityMap = new Map(entities.map((e) => [e.id, e.name]));
	return buildReminderSchedule(templates, transactions, now).map(({ transaction, fireAt }) => ({
		transactionId: transaction.id,
		fromName: entityMap.get(transaction.from_entity_id) ?? 'Unknown',
		toName: entityMap.get(transaction.to_entity_id) ?? 'Unknown',
		amount: `${formatAmount(transaction.amount_minor, transaction.currency)} ${transaction.currency}`,
		timestamp: fireAt,
	}));
}

/**
 * Stable key for a resolved schedule, used to skip the native
 * cancel-and-reschedule sweep when nothing changed.
 *
 * Keyed on the whole payload rather than `id@fireAt`: the notification body is
 * `${fromName} → ${toName}: ${amount}`, so an amount edit, a currency change or
 * an entity rename all change what the user reads while leaving the entry
 * identity untouched. With an identity-only key those edits would sweep,
 * compare equal, and leave the OS holding the pre-edit text (KII-159).
 *
 * Sorted defensively so the key describes the set, not the emission order.
 */
function reminderFingerprint(payloads: ReminderPayload[]): string | null {
	if (payloads.length === 0) return null;
	const sorted = [...payloads].sort(
		(a, b) => a.timestamp - b.timestamp || a.transactionId.localeCompare(b.transactionId)
	);
	return JSON.stringify(sorted);
}

/**
 * Cancel-and-reschedule sweep for transaction reminders (KII-159).
 *
 * Future recurring occurrences are virtual — they have no row to hang a
 * notification id on — so there is no per-occurrence bookkeeping to keep in
 * sync. Instead the whole pending set is rebuilt whenever it changes, which
 * makes the scheduler self-healing: an occurrence confirmed early, excluded, or
 * edited simply isn't in the next sweep's set.
 *
 * A fingerprint of the intended schedule is persisted, so a steady-state call
 * (app foreground with nothing changed) costs one pure computation and zero
 * native calls.
 */
export async function syncScheduledReminders(
	templates: RecurrenceTemplate[],
	transactions: Transaction[],
	entities: Entity[]
): Promise<void> {
	if (!(await getRemindersEnabled())) return;

	const payloads = resolveReminderPayloads(templates, transactions, entities, Date.now());
	const fingerprint = reminderFingerprint(payloads);
	if (fingerprint === (await getScheduledReminderKey())) return;

	// The sweep is not atomic, so the key is cleared BEFORE the OS schedule is
	// emptied. If anything below throws, the stored key must not describe a
	// schedule that no longer exists: a later sweep computing the same set would
	// compare equal, return early, and leave the user with no reminders at all —
	// silently, since the store's caller only warns (KII-159).
	await setScheduledReminderKey(null);
	await cancelAllNotifications();

	let failed = false;
	if (payloads.length > 0) {
		await setupNotificationChannel();
		for (const payload of payloads) {
			try {
				await scheduleTransactionNotification(payload);
			} catch (e) {
				failed = true;
				console.warn('Failed to schedule reminder for', payload.transactionId, e);
			}
		}
	}

	// A partial schedule is not the schedule the fingerprint describes; leaving
	// the key null makes the next sweep retry instead of short-circuiting.
	if (!failed) await setScheduledReminderKey(fingerprint);
}
