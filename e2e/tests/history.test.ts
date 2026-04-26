import { waitFor, element, by } from 'detox';
import { expect as jestExpect } from '@jest/globals';
import { TestIDs } from '../support/test-ids';
import {
	createTransaction,
	ensureHomeScreen,
	getAmount,
	launchFreshAndDismissOverlays,
} from '../support/helpers';

// History screen end-to-end flows: edit via row tap and delete via swipe.
// Both require real app lifecycle, cross-screen navigation, and (for swipe)
// the native pan gesture registered in TransactionRow — none of which can
// be reproduced in headless component tests.
//
// Data setup: each test calls createTransaction (full [+] UI flow) so the row
// is always visible with the latest timestamp. On retry, atIndex(0) still picks
// the most recent row — newest transactions appear at the top of the list.
describe('History', () => {
	beforeAll(async () => {
		await launchFreshAndDismissOverlays();
	});

	beforeEach(async () => {
		await ensureHomeScreen();
	});

	async function openHistoryTab() {
		await element(by.id(TestIDs.historyTabButton)).tap();
		await waitFor(element(by.id(TestIDs.historyScreen)))
			.toBeVisible()
			.withTimeout(5000);
		// History screen may already be mounted (React Navigation keeps tabs alive).
		// useDeferredValue in history.tsx defers the transaction list render by one
		// cycle — give it time to populate before querying rows.
		await new Promise((r) => setTimeout(r, 500));
	}

	async function returnToHome() {
		await element(by.id(TestIDs.dashboardTabButton)).tap();
		await waitFor(element(by.id(TestIDs.homeScreen)))
			.toBeVisible()
			.withTimeout(5000);
	}

	// ── Edit ─────────────────────────────────────────────────────────────────

	it('History edit: tap row → change amount → balance reflects edit', async () => {
		await createTransaction('Main Card', 'Groceries', '40');
		const balanceAfterCreate = await getAmount('Groceries');

		await openHistoryTab();

		// atIndex(0) = most recent row (just created, newest timestamp).
		// atIndex is required in waitFor too — without it, when multiple 'Main Card'
		// rows exist Detox cannot determine which one to check and silently times out.
		await waitFor(element(by.text('Main Card').withAncestor(by.id(TestIDs.historyScreen))).atIndex(0))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.text('Main Card').withAncestor(by.id(TestIDs.historyScreen)))
			.atIndex(0)
			.tap();

		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.transaction.amountInput)).clearText();
		await element(by.id(TestIDs.transaction.amountInput)).typeText('60');
		// Let the keyboard animation settle before tapping save (save lives in the
		// modal header, above the scroll view — not affected by scroll position).
		await new Promise((r) => setTimeout(r, 500));
		await element(by.id(TestIDs.transaction.saveButton)).tap();

		// Verify the modal closed and we are back on the history screen
		await waitFor(element(by.id(TestIDs.historyScreen)))
			.toBeVisible()
			.withTimeout(5000);

		await returnToHome();

		// Created 40, edited to 60 — net delta is +20 vs balanceAfterCreate
		jestExpect(await getAmount('Groceries')).toBe(balanceAfterCreate + 20);
	});

	// ── Swipe-delete ─────────────────────────────────────────────────────────

	it('History swipe-delete: swipe left past threshold → confirm → balance reverts', async () => {
		await createTransaction('Main Card', 'Groceries', '55');
		const balanceAfterCreate = await getAmount('Groceries');

		await openHistoryTab();

		// atIndex(0) = most recent row (just created, newest timestamp).
		// atIndex is required in waitFor too — without it, when multiple 'Main Card'
		// rows exist Detox cannot determine which one to check and silently times out.
		await waitFor(element(by.text('Main Card').withAncestor(by.id(TestIDs.historyScreen))).atIndex(0))
			.toBeVisible()
			.withTimeout(5000);

		// Swipe on the from-entity text — the gesture propagates up through the
		// RNGH GestureDetector's pan recognizer on iOS.
		await element(by.text('Main Card').withAncestor(by.id(TestIDs.historyScreen)))
			.atIndex(0)
			.swipe('left', 'fast', 0.7);

		await waitFor(element(by.text('Delete')))
			.toBeVisible()
			.withTimeout(3000);
		await element(by.text('Delete')).tap();

		// Wait for the Alert to fully dismiss — UITransitionView covers the tab bar
		// during the dismiss animation and blocks the dashboardTabButton tap.
		await waitFor(element(by.text('Delete')))
			.not.toBeVisible()
			.withTimeout(3000);

		await returnToHome();

		jestExpect(await getAmount('Groceries')).toBe(balanceAfterCreate - 55);
	});
});
