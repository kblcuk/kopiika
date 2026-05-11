import { waitFor, element, by } from 'detox';
import { TestIDs } from '../support/test-ids';
import {
	createTransaction,
	ensureHomeScreen,
	expectAmount,
	getAmount,
	launchFreshAndDismissOverlays,
} from '../support/helpers';
import { seedFixture } from '../support/fixture';

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
		const dashboardTab = element(by.id(TestIDs.dashboardTabButton));

		// Use 100% visibility threshold to ensure the tab bar is fully in view.
		// Any remaining "not hittable" errors should be handled by waiting for
		// specific dismissals in the test body.
		await waitFor(dashboardTab).toBeVisible(100).withTimeout(5000);

		await dashboardTab.tap();
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
		await waitFor(
			element(by.text('Main Card').withAncestor(by.id(TestIDs.historyScreen))).atIndex(0)
		)
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

		const saveButton = element(by.id(TestIDs.transaction.saveButton));
		await waitFor(saveButton).toBeVisible().withTimeout(2000);
		await saveButton.tap();

		// Wait for the modal to fully disappear before navigating back.
		// This clears the UITransitionView that would otherwise block the tab bar.
		await waitFor(saveButton).not.toExist().withTimeout(5000);

		// Verify we are back on the history screen
		await waitFor(element(by.id(TestIDs.historyScreen)))
			.toBeVisible()
			.withTimeout(5000);

		await returnToHome();

		// Created 40, edited to 60 — net delta is +20 vs balanceAfterCreate
		await expectAmount('Groceries', balanceAfterCreate + 20);
	});

	// ── Confirm pill on recurring transaction (KII-106) ─────────────────────

	// On Android, the Confirm pill (a RN Pressable) used to compete with the
	// row's RNGH tap gesture: tapping it confirmed the tx AND opened the
	// "Edit Recurring Transaction" dialog. Verified at the unit level via
	// gesture-composition wiring; this guards the real on-device gesture race.
	it('History confirm pill: tapping does not open "Edit Recurring Transaction" dialog', async () => {
		await seedFixture({
			transactions: [
				{
					from: 'Main Card',
					to: 'Groceries',
					amount: 12.34,
					seriesId: 'kii-106-series',
					isConfirmed: false,
					// One hour ago — lands in "Needs Confirmation" bucket while
					// staying inside the current-month period filter regardless
					// of the emulator's local time-of-day.
					timestampOffsetMs: -60 * 60 * 1000,
				},
			],
		});

		await openHistoryTab();

		// Only one unconfirmed row exists in the seed, so match by visible text.
		const confirmPill = element(
			by.text('Confirm').withAncestor(by.id(TestIDs.historyScreen))
		).atIndex(0);
		await waitFor(confirmPill).toBeVisible().withTimeout(10000);
		await confirmPill.tap();

		// The buggy behaviour: the parent row's tap fires alongside the
		// Pressable, opening the Edit Recurring Transaction alert. Assert it
		// stays absent. (Detox's `not.toExist` is the strongest assertion
		// — passes immediately if the element was never created.)
		await waitFor(element(by.text('Edit Recurring Transaction')))
			.not.toExist()
			.withTimeout(2000);

		// After confirmation the Confirm pill disappears.
		await waitFor(confirmPill).not.toExist().withTimeout(5000);

		await returnToHome();
	});

	// ── Swipe-delete ─────────────────────────────────────────────────────────

	it('History swipe-delete: swipe left past threshold → confirm → balance reverts', async () => {
		await createTransaction('Main Card', 'Groceries', '55');
		const balanceAfterCreate = await getAmount('Groceries');

		await openHistoryTab();

		// atIndex(0) = most recent row (just created, newest timestamp).
		// atIndex is required in waitFor too — without it, when multiple 'Main Card'
		// rows exist Detox cannot determine which one to check and silently times out.
		await waitFor(
			element(by.text('Main Card').withAncestor(by.id(TestIDs.historyScreen))).atIndex(0)
		)
			.toBeVisible()
			.withTimeout(5000);

		// Swipe on the from-entity text — the gesture propagates up through the
		// RNGH GestureDetector's pan recognizer on iOS.
		await element(by.text('Main Card').withAncestor(by.id(TestIDs.historyScreen)))
			.atIndex(0)
			.swipe('left', 'slow', 0.8);

		const deleteAlertButton = element(by.text('Delete'));
		await waitFor(deleteAlertButton).toBeVisible(100).withTimeout(5000);
		await deleteAlertButton.tap();

		// Wait for the Alert to fully dismiss. This ensures the native
		// UITransitionView is removed and the tab bar becomes hittable.
		await waitFor(deleteAlertButton).not.toExist().withTimeout(5000);

		await returnToHome();

		await expectAmount('Groceries', balanceAfterCreate - 55);
	});
});
