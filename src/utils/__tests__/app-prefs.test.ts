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

describe('app-prefs — collapsed sections', () => {
	beforeEach(() => clearStore());

	test('every section defaults to expanded when unset', async () => {
		const { getCollapsedSections } = await import('../app-prefs');
		expect(await getCollapsedSections()).toEqual({
			income: false,
			account: false,
			category: false,
			saving: false,
		});
	});

	test('collapsed sections round-trip through set/get', async () => {
		const { getCollapsedSections, setCollapsedSections } = await import('../app-prefs');
		await setCollapsedSections({
			income: false,
			account: true,
			category: false,
			saving: true,
		});
		expect(await getCollapsedSections()).toEqual({
			income: false,
			account: true,
			category: false,
			saving: true,
		});
	});

	test('sections absent from stored prefs read as expanded', async () => {
		const { getCollapsedSections, setLastSeenVersion } = await import('../app-prefs');
		// Simulate prefs written by an older build: the key exists, but only
		// carries one section.
		await setLastSeenVersion('0.3.26');
		store.collapsedSections = { category: true };
		expect(await getCollapsedSections()).toEqual({
			income: false,
			account: false,
			category: true,
			saving: false,
		});
	});
});
