import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Entity, Transaction } from '@/src/types';
import { REMINDER_HOUR } from '../reminder-schedule';
import * as notifications from '../notifications';
import { syncScheduledReminders } from '../reminders';
import { formatAmount } from '@/src/utils/format';
import {
	getScheduledReminderKey,
	setRemindersEnabled,
	setScheduledReminderKey,
} from '@/src/utils/app-prefs';

const DAY = 86_400_000;

function inDays(days: number): number {
	const d = new Date(Date.now() + days * DAY);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).getTime();
}

/** 09:00 local on the civil date `days` from today. */
function reminderAt(days: number): number {
	const d = new Date(Date.now() + days * DAY);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), REMINDER_HOUR, 0, 0, 0).getTime();
}

const entities: Entity[] = [
	{ id: 'acc-1', type: 'account', name: 'Checking', currency: 'USD', row: 0, position: 0 },
	{ id: 'cat-1', type: 'category', name: 'Rent', currency: 'USD', row: 0, position: 0 },
];

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
	id: 'tx-1',
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount_minor: 150000,
	currency: 'USD',
	timestamp: inDays(3),
	is_confirmed: false,
	...overrides,
});

describe('syncScheduledReminders', () => {
	let cancelAll: ReturnType<typeof spyOn>;
	let schedule: ReturnType<typeof spyOn>;

	beforeEach(async () => {
		cancelAll = spyOn(notifications, 'cancelAllNotifications');
		schedule = spyOn(notifications, 'scheduleTransactionNotification');
		await setRemindersEnabled(true);
		await setScheduledReminderKey(null);
	});

	afterEach(() => {
		cancelAll.mockRestore();
		schedule.mockRestore();
	});

	test('does nothing at all when reminders are disabled', async () => {
		await setRemindersEnabled(false);

		await syncScheduledReminders([], [tx()], entities);

		expect(cancelAll).not.toHaveBeenCalled();
		expect(schedule).not.toHaveBeenCalled();
		expect(await getScheduledReminderKey()).toBeNull();
	});

	test('schedules one reminder per upcoming unconfirmed row, at 09:00 on its own day', async () => {
		await syncScheduledReminders([], [tx({ id: 'tx-1', timestamp: inDays(3) })], entities);

		expect(cancelAll).toHaveBeenCalledTimes(1);
		expect(schedule).toHaveBeenCalledTimes(1);
		expect(schedule.mock.calls[0]![0]).toEqual({
			transactionId: 'tx-1',
			fromName: 'Checking',
			toName: 'Rent',
			amount: `${formatAmount(150000, 'USD')} USD`,
			timestamp: reminderAt(3),
		});
		expect(await getScheduledReminderKey()).not.toBeNull();
	});

	test('skips the native sweep entirely when the schedule is unchanged', async () => {
		const transactions = [tx()];
		await syncScheduledReminders([], transactions, entities);
		cancelAll.mockClear();
		schedule.mockClear();

		await syncScheduledReminders([], transactions, entities);

		expect(cancelAll).not.toHaveBeenCalled();
		expect(schedule).not.toHaveBeenCalled();
	});

	// The self-healing property: nothing cancels tx-1's reminder by id — it simply
	// isn't in the next set, and the sweep rebuilds from scratch (KII-159).
	test('drops the reminder for an occurrence confirmed before its due day', async () => {
		await syncScheduledReminders([], [tx({ id: 'tx-1' })], entities);
		cancelAll.mockClear();
		schedule.mockClear();

		await syncScheduledReminders([], [tx({ id: 'tx-1', is_confirmed: true })], entities);

		expect(cancelAll).toHaveBeenCalledTimes(1);
		expect(schedule).not.toHaveBeenCalled();
		expect(await getScheduledReminderKey()).toBeNull();
	});

	test('a failed schedule call does not abort the rest of the sweep', async () => {
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		type ScheduleParams = Parameters<typeof notifications.scheduleTransactionNotification>[0];
		schedule.mockImplementation((params: ScheduleParams) => {
			if (params.transactionId === 'tx-1') return Promise.reject(new Error('OS rejected'));
			return Promise.resolve('notif-id');
		});

		try {
			await syncScheduledReminders(
				[],
				[
					tx({ id: 'tx-1', timestamp: inDays(1) }),
					tx({ id: 'tx-2', timestamp: inDays(2) }),
				],
				entities
			);
		} finally {
			warn.mockRestore();
		}

		expect(schedule).toHaveBeenCalledTimes(2);
	});

	// The sweep is not atomic: once the OS schedule has been emptied, a key that
	// still describes the intended set would make every later sweep of the same
	// set compare equal and return early, leaving the user with no reminders.
	test('persists no key when a schedule call fails, so the next sweep retries', async () => {
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		const transactions = [tx({ id: 'tx-1' })];
		schedule.mockImplementation(() => Promise.reject(new Error('OS rejected')));

		try {
			await syncScheduledReminders([], transactions, entities);
			expect(await getScheduledReminderKey()).toBeNull();

			// Same set, so an identity-only comparison against a persisted key would
			// short-circuit here. It must not.
			cancelAll.mockClear();
			schedule.mockClear();
			schedule.mockImplementation(() => Promise.resolve('notif-id'));
			await syncScheduledReminders([], transactions, entities);
		} finally {
			warn.mockRestore();
		}

		expect(cancelAll).toHaveBeenCalledTimes(1);
		expect(schedule).toHaveBeenCalledTimes(1);
		expect(await getScheduledReminderKey()).not.toBeNull();
	});

	// The stale-key case: a *previously scheduled* set is being replaced when the
	// native layer throws. The old key must not survive the cancel that already
	// happened, or every later sweep of that old set compares equal and returns.
	test('clears the previous key when the native layer throws mid-sweep', async () => {
		await syncScheduledReminders([], [tx({ id: 'tx-1' })], entities);
		expect(await getScheduledReminderKey()).not.toBeNull();
		cancelAll.mockClear();

		const channel = spyOn(notifications, 'setupNotificationChannel').mockImplementation(() =>
			Promise.reject(new Error('channel setup failed'))
		);
		try {
			await expect(
				syncScheduledReminders(
					[],
					[tx({ id: 'tx-1' }), tx({ id: 'tx-2', timestamp: inDays(4) })],
					entities
				)
			).rejects.toThrow('channel setup failed');
		} finally {
			channel.mockRestore();
		}

		expect(cancelAll).toHaveBeenCalledTimes(1);
		expect(await getScheduledReminderKey()).toBeNull();
	});

	// The sweep is a read-modify-write over shared OS state with five await
	// points, and overlapping callers are ordinary: the foreground listener
	// dispatches `void backfillRecurringIfStale()` while the user can already tap
	// Confirm. Unserialized, the two runs lock-step through their awaits — B's
	// cancel wipes the entries A already scheduled, then A schedules the rest on
	// top of B's set, and B's fingerprint claims a clean schedule that never
	// self-heals (KII-159).
	test('serializes overlapping sweeps instead of interleaving their native calls', async () => {
		const calls: string[] = [];
		cancelAll.mockImplementation(async () => {
			calls.push('cancel');
			await Promise.resolve();
		});
		type ScheduleParams = Parameters<typeof notifications.scheduleTransactionNotification>[0];
		schedule.mockImplementation(async (params: ScheduleParams) => {
			calls.push(`schedule:${params.transactionId}`);
			await Promise.resolve();
			return 'notif-id';
		});

		const first = syncScheduledReminders(
			[],
			[tx({ id: 'a-1', timestamp: inDays(1) }), tx({ id: 'a-2', timestamp: inDays(2) })],
			entities
		);
		const second = syncScheduledReminders(
			[],
			[tx({ id: 'b-1', timestamp: inDays(3) }), tx({ id: 'b-2', timestamp: inDays(4) })],
			entities
		);
		await Promise.all([first, second]);

		expect(calls).toEqual([
			'cancel',
			'schedule:a-1',
			'schedule:a-2',
			'cancel',
			'schedule:b-1',
			'schedule:b-2',
		]);
		// The last sweep to run is the one the persisted key must describe.
		const key = await getScheduledReminderKey();
		expect(key).not.toBeNull();
		expect(JSON.parse(key!).map((p: { transactionId: string }) => p.transactionId)).toEqual([
			'b-1',
			'b-2',
		]);
	});

	// A rejected sweep must reject for ITS caller (the store logs the failure)
	// without poisoning the chain for the next one — the `.catch` in
	// `syncScheduledReminders` applies to the chain, not to the returned promise.
	test('a rejected sweep does not poison the next one', async () => {
		// Only the first sweep's channel setup throws; the second must still run.
		let failNextChannelSetup = true;
		const channel = spyOn(notifications, 'setupNotificationChannel').mockImplementation(() => {
			if (!failNextChannelSetup) return Promise.resolve();
			failNextChannelSetup = false;
			return Promise.reject(new Error('channel setup failed'));
		});

		const failing = syncScheduledReminders([], [tx({ id: 'boom' })], entities);
		const following = syncScheduledReminders(
			[],
			[tx({ id: 'after', timestamp: inDays(2) })],
			entities
		);

		try {
			await expect(failing).rejects.toThrow('channel setup failed');
			await following;
		} finally {
			channel.mockRestore();
		}

		expect(schedule).toHaveBeenCalledTimes(1);
		expect(schedule.mock.calls[0]![0]).toMatchObject({ transactionId: 'after' });
	});

	// KII-159: the body is `${fromName} → ${toName}: ${amount}`, so content edits
	// have to invalidate the guard even though the entry identity is unchanged.
	describe('content edits', () => {
		test('reschedules when only the amount changed', async () => {
			await syncScheduledReminders([], [tx({ amount_minor: 150000 })], entities);
			cancelAll.mockClear();
			schedule.mockClear();

			await syncScheduledReminders([], [tx({ amount_minor: 200000 })], entities);

			expect(cancelAll).toHaveBeenCalledTimes(1);
			expect(schedule).toHaveBeenCalledTimes(1);
			expect(schedule.mock.calls[0]![0]).toMatchObject({
				transactionId: 'tx-1',
				amount: `${formatAmount(200000, 'USD')} USD`,
			});
		});

		test('reschedules when an entity is renamed', async () => {
			await syncScheduledReminders([], [tx()], entities);
			cancelAll.mockClear();
			schedule.mockClear();

			const renamed = entities.map((e) =>
				e.id === 'cat-1' ? { ...e, name: 'Mortgage' } : e
			);
			await syncScheduledReminders([], [tx()], renamed);

			expect(cancelAll).toHaveBeenCalledTimes(1);
			expect(schedule).toHaveBeenCalledTimes(1);
			expect(schedule.mock.calls[0]![0]).toMatchObject({ toName: 'Mortgage' });
		});

		test('reschedules when only the currency changed', async () => {
			await syncScheduledReminders([], [tx({ currency: 'USD' })], entities);
			cancelAll.mockClear();
			schedule.mockClear();

			await syncScheduledReminders([], [tx({ currency: 'EUR' })], entities);

			expect(cancelAll).toHaveBeenCalledTimes(1);
			expect(schedule.mock.calls[0]![0]).toMatchObject({
				amount: `${formatAmount(150000, 'EUR')} EUR`,
			});
		});
	});
});
