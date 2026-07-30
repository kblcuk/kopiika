import { device, waitFor, element, by, expect } from 'detox';
import { TestIDs } from '../support/test-ids';
import {
	createTransaction,
	ensureHomeScreen,
	expectAmount,
	getAmount,
	launchAppFast,
	tapUntilGone,
	tapUntilVisible,
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
		await launchAppFast();
	});

	beforeEach(async () => {
		await ensureHomeScreen();
	});

	async function openHistoryTab() {
		// Retry the tab tap until the history screen appears. Sync is disabled
		// suite-wide, so a single tap issued while the app is still settling — e.g.
		// mid-`router.dismiss()` after `seedFixture`'s deep-link — is silently
		// dropped and the screen never opens. Re-tapping an already-active tab is
		// a no-op, so this is safe on the paths where the first tap lands.
		await tapUntilVisible(by.id(TestIDs.historyTabButton), by.id(TestIDs.historyScreen));
		// History screen may already be mounted (React Navigation keeps tabs alive)
		// and useDeferredValue in history.tsx defers the row render by one cycle —
		// callers waitFor a specific row, which handles the deferral naturally.
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

	// Regression: `removeClippedSubviews` on the history SectionList detached
	// off-screen rows from the native view tree; when a row scrolled back in,
	// its RNGH tap gesture was dead and tapping no longer opened the edit modal.
	// Worked on first render (visible rows freshly mounted) but broke after any
	// scroll — intermittently, depending on which rows got clipped/recycled.
	// Unit tests can't catch it (RNGH is mocked); the first edit test above taps
	// the top row without scrolling. This seeds enough rows to push a uniquely
	// named target well past initialNumToRender (=10), scrolls to it, and taps.
	it('History edit after scroll: a virtualized (recycled) row stays tappable', async () => {
		await seedFixture({
			// Clear first so the unique ScrollTarget row exists exactly once even
			// when jest re-runs this body on retry. (The ScrollTarget entity is
			// seeded idempotently — see app/e2e/fixture.tsx — so retries don't stack
			// duplicate categories.)
			clearTransactions: true,
			entities: [{ type: 'category', name: 'ScrollTarget' }],
			transactions: [
				// Oldest timestamp => bottom of today's group. With 12 filler rows
				// the target lands at list index 12, just past initialNumToRender
				// (10) — off-screen until scrolled to, so it still exercises the
				// virtualized/recycled path, but reachable in one short scroll.
				// Keeping the row count low matters: sync is disabled suite-wide
				// (see e2e/README.md), so a long whileElement scroll can outrun the
				// SectionList's incremental rendering and stop at a false edge.
				{
					from: 'Main Card',
					to: 'ScrollTarget',
					amount: 42,
					isConfirmed: true,
					timestampOffsetMs: -30 * 60 * 1000,
				},
				// Filler rows above the target — all confirmed and inside the
				// current-month period. Newer than the target (smaller offsets), so
				// the target sorts to the bottom of the day group.
				...Array.from({ length: 12 }, (_, i) => ({
					from: 'Main Card',
					to: 'Groceries',
					amount: 10 + i,
					isConfirmed: true,
					timestampOffsetMs: -(13 - i) * 60 * 1000,
				})),
			],
		});

		await openHistoryTab();

		// Sync is disabled suite-wide (see e2e/README.md) and history.tsx defers
		// the row render by one useDeferredValue cycle, so the SectionList can
		// still be empty the instant historyScreen becomes visible. Wait for a
		// seeded on-screen row before scrolling — otherwise whileElement starts
		// on an unpopulated list, hits stale-at-edge immediately and gives up
		// (manifests as a "history-transaction-list not visible" scroll failure).
		await waitFor(
			element(by.text('Groceries').withAncestor(by.id(TestIDs.historyScreen))).atIndex(0)
		)
			.toBeVisible()
			.withTimeout(10000);

		const targetMatcher = by.text('ScrollTarget').withAncestor(by.id(TestIDs.historyScreen));

		// Re-enable Detox synchronization for just the scroll + tap. Sync is off
		// suite-wide because the home screen never idles (continuous layout work),
		// but the history list DOES settle between scroll batches. With sync off,
		// Detox's scroll outruns the SectionList's incremental rendering and stalls
		// at a false stale-edge before the target mounts, and a tap fired before the
		// scrolled-in row settles is dropped — both intermittently (worse on faster
		// hardware). Enabling sync makes Detox wait for each render/settle. Scoped in
		// try/finally so it's always turned back off before returnToHome touches the
		// never-idle home screen.
		await device.enableSynchronization();
		try {
			// The target starts off-screen (unrendered) at list index 12, just past
			// initialNumToRender — only mounted once scrolled to, so this still
			// exercises the virtualized/recycled path.
			await waitFor(element(targetMatcher))
				.toBeVisible()
				.whileElement(by.id('history-transaction-list'))
				.scroll(250, 'down');

			// The edit modal only opens if the recycled row's tap gesture still
			// fires — the regression this test guards. A genuinely dead gesture
			// never opens the modal, so this still fails as intended.
			await element(targetMatcher).tap();
			await waitFor(element(by.id(TestIDs.transaction.amountInput)))
				.toBeVisible()
				.withTimeout(5000);
		} finally {
			await device.disableSynchronization();
		}

		// Dismiss so the tab bar is hittable for the next test. Retry the cancel
		// tap: the modal has only just slid in, and a single tap fired mid-
		// animation is dropped with sync disabled, leaving the modal open.
		await tapUntilGone(
			by.id(TestIDs.transaction.cancelButton),
			by.id(TestIDs.transaction.amountInput)
		);
		await waitFor(element(by.id(TestIDs.transaction.amountInput)))
			.not.toExist()
			.withTimeout(5000);

		await returnToHome();
	});

	// ── Confirm pill on recurring transaction (KII-106) ─────────────────────

	// On Android, the Confirm pill (a RN Pressable) used to compete with the
	// row's RNGH tap gesture: tapping it confirmed the tx AND opened the
	// "Edit Recurring Transaction" dialog. Verified at the unit level via
	// gesture-composition wiring; this guards the real on-device gesture race.
	it('History confirm pill: tapping does not open "Edit Recurring Transaction" dialog', async () => {
		await seedFixture({
			// Clear first so exactly one unconfirmed row (one Confirm pill) exists,
			// even on a jest retry — a re-seed would otherwise leave a second pill
			// and the post-confirm `not.toExist` assertion could never pass.
			clearTransactions: true,
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

	// KII-154: long-press replaces what a tap used to do. Pass an explicit
	// duration rather than relying on Detox's default — the gesture arms at
	// ~600ms (450ms after the drag lifts the bubble at 150ms).
	it('long-pressing a bubble opens History filtered to that entity', async () => {
		await element(by.id(TestIDs.entityBubble('Groceries'))).longPress(900);

		await waitFor(element(by.id(TestIDs.historyScreen)))
			.toBeVisible()
			.withTimeout(5000);
		await expect(element(by.id(TestIDs.historyEntityFilterLabel))).toHaveText('Groceries');

		await returnToHome();
	});
});
