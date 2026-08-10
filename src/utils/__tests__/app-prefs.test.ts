import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Single module mock at top level — first registration wins in bun's module cache.
// All tests share the same mutable `store`; `beforeEach` resets it between tests.
const store: Record<string, unknown> = {};

// `void` discards the Promise so the registration is synchronous at module scope.
void mock.module('expo-file-system', () => {
	class MockFile {
		get exists() {
			return Object.keys(store).length > 0;
		}
		async text() {
			return JSON.stringify(store);
		}
		write(content: string) {
			const parsed = JSON.parse(content) as Record<string, unknown>;
			Object.keys(store).forEach((k) => delete store[k]);
			Object.assign(store, parsed);
		}
	}
	return { File: MockFile, Paths: { document: '/tmp' } };
});

function clearStore() {
	Object.keys(store).forEach((k) => delete store[k]);
}

describe('app prefs', () => {
	beforeEach(() => clearStore());

	test('getRemindersEnabled defaults to disabled for new installs', async () => {
		const { getRemindersEnabled } = await import('../app-prefs');
		expect(await getRemindersEnabled()).toBe(false);
	});

	test('scheduledReminderKey defaults to null when unset', async () => {
		const { getScheduledReminderKey } = await import('../app-prefs');
		expect(await getScheduledReminderKey()).toBeNull();
	});

	test('scheduledReminderKey round-trips through set/get', async () => {
		const { getScheduledReminderKey, setScheduledReminderKey } = await import('../app-prefs');
		await setScheduledReminderKey('tx-1@100,tx-2@200');
		expect(await getScheduledReminderKey()).toBe('tx-1@100,tx-2@200');
	});

	// The sweep persists `null` for an empty schedule, and Settings writes `null`
	// to force the next sweep — both must read back as null, not as the old key.
	test('scheduledReminderKey clears back to null', async () => {
		const { getScheduledReminderKey, setScheduledReminderKey } = await import('../app-prefs');
		await setScheduledReminderKey('tx-1@100');
		await setScheduledReminderKey(null);
		expect(await getScheduledReminderKey()).toBeNull();
	});

	test('defaultCurrency is null until set, then round-trips', async () => {
		const { getDefaultCurrency, setDefaultCurrency } = await import('../app-prefs');
		expect(await getDefaultCurrency()).toBeNull();
		await setDefaultCurrency('GBP');
		expect(await getDefaultCurrency()).toBe('GBP');
	});
});

describe('app-prefs — onboarding keys', () => {
	beforeEach(() => clearStore());

	test('hasCompletedOnboarding defaults to false when unset', async () => {
		const { getHasCompletedOnboarding } = await import('../app-prefs');
		expect(await getHasCompletedOnboarding()).toBe(false);
	});

	test('hasCompletedOnboarding round-trips through set/get', async () => {
		const { getHasCompletedOnboarding, setHasCompletedOnboarding } =
			await import('../app-prefs');
		await setHasCompletedOnboarding(true);
		expect(await getHasCompletedOnboarding()).toBe(true);
	});

	test('emptyBoardNudgeDismissed defaults to false when unset', async () => {
		const { getEmptyBoardNudgeDismissed } = await import('../app-prefs');
		expect(await getEmptyBoardNudgeDismissed()).toBe(false);
	});

	test('emptyBoardNudgeDismissed round-trips through set/get', async () => {
		const { getEmptyBoardNudgeDismissed, setEmptyBoardNudgeDismissed } =
			await import('../app-prefs');
		await setEmptyBoardNudgeDismissed(true);
		expect(await getEmptyBoardNudgeDismissed()).toBe(true);
	});
});
