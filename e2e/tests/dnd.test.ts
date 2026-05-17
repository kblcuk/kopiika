import { device, waitFor, element, by } from 'detox';
import { TestIDs } from '../support/test-ids';
import { seedFixture } from '../support/fixture';
import {
	createTransactionViaDnD,
	dnd,
	ensureHomeScreen,
	expectAmount,
	expectNoTransactionModal,
	getAmount,
	launchAppFast,
} from '../support/helpers';

// Detox iOS doesn't synthesize a true held-finger drag — `longPressAndDrag`
// tweens source→target almost instantly, so react-native-sortables never
// fully enters drag-mode visually and the auto-scroll frame callback gets
// at most a frame or two at the edge before the drop fires.
// See https://github.com/wix/Detox/issues/3861.
//
// Android's UIAutomator-based gestures honour the long-press + held-finger
// timing correctly, so this test is gated to Android only. iOS auto-scroll
// behaviour is verified manually + by `pickHoveredSection` unit tests in
// src/utils/__tests__/drag-auto-scroll.test.ts.
const itAndroidOnly = device.getPlatform() === 'android' ? it : it.skip;

// Drag-and-drop interactions on the home screen. Each test exercises a
// distinct DnD-driven path that can only be verified end-to-end:
//   - one happy path (account → category)
//   - one reverse-drag flow (refund picker)
//   - one reservation flow (account → saving)
//   - one blocked drag (no modal opens)
// The exhaustive allowed/blocked pair matrix lives in
// `transaction-validation.test.ts`; drag target resolution lives in
// `drop-zone.test.ts`. Modal/picker UI is covered by component tests.
describe('Transactions — drag and drop', () => {
	beforeAll(async () => {
		await launchAppFast();
	});

	beforeEach(async () => {
		await ensureHomeScreen();
	});

	// ── Happy path ───────────────────────────────────────────────────────────

	it('DnD Account → Category: balances update after save', async () => {
		const before = {
			cat: await getAmount('Groceries'),
			acct: await getAmount('Main Card'),
		};

		await createTransactionViaDnD('Main Card', 'Groceries', '17.33');

		await expectAmount('Groceries', before.cat + 17.33);
		await expectAmount('Main Card', before.acct - 17.33);
	});

	// ── Reverse-drag special flow ────────────────────────────────────────────

	it('DnD Category → Account: opens refund picker (reversed account→category)', async () => {
		await seedFixture([{ from: 'Main Card', to: 'Groceries', amount: 55.0 }]);

		await dnd('Groceries', 'Main Card');

		await waitFor(element(by.id(TestIDs.refundPicker.modal)))
			.toBeVisible()
			.withTimeout(5000);
	});

	// ── Blocked drag ─────────────────────────────────────────────────────────

	it('DnD Category → Category: blocked — no transaction modal appears', async () => {
		await dnd('Groceries', 'Transport');
		await expectNoTransactionModal();
	});

	// ── Reservation flow ─────────────────────────────────────────────────────
	// Runs after the blocked-drag test: this one wipes the seeded entities
	// (see comment in the test), which would otherwise remove the Groceries /
	// Transport the blocked-drag test needs.

	it('DnD Account → Saving: opens reservation modal, not transaction modal', async () => {
		// The default 12-preset seed (1 income + 3 accounts + 6 categories +
		// 2 savings) overflows iPhone 16e's viewport, putting Vacation below
		// the fold. `longPressAndDrag` requires both source and target at 100%
		// visibility — and there's no scroll position where Main Card (top of
		// Accounts) and Vacation (in Savings, below 3 rows of Categories) fit
		// together. Wipe the seeded entities and seed only what this test
		// needs so both bubbles render above the fold on any viewport.
		// `launchAppFast` in the next suite re-seeds missing presets via
		// skip-onboarding, so state is restored automatically.
		await seedFixture({
			clearEntities: true,
			entities: [
				{ type: 'account', name: 'Main Card', icon: 'credit-card' },
				{ type: 'saving', name: 'Vacation', icon: 'plane' },
			],
		});
		// `seedFixture` already waits for Main Card, but Vacation is the drag
		// target — make sure it's laid out before issuing the gesture, or the
		// drop can hit a stale section.
		await waitFor(element(by.id(TestIDs.entityBubble('Vacation'))))
			.toBeVisible(100)
			.withTimeout(5000);

		await dnd('Main Card', 'Vacation');

		await waitFor(element(by.id(TestIDs.reservation.modal)))
			.toBeVisible()
			.withTimeout(5000);
	});

	// ── Auto-scroll while dragging (KII-97, Android-only) ────────────────────
	itAndroidOnly('DnD: auto-scrolls Accounts row when finger holds at right edge', async () => {
		// Run from a fresh app launch. Earlier tests in the suite leave
		// UI/navigation state that intermittently makes `home-scroll-view`
		// fail Detox's effective-visibility check, so reset before seeding
		// the heavier fixture this test needs.
		await launchAppFast();

		// Seed a realistic data set: 9 accounts (defaults Main Card +
		// Cash + Savings account plus 6 extras) and 20 categories (defaults
		// plus 16 extras spread across the 3 visual rows). With this, the
		// Accounts row overflows horizontally — Acct08 starts well off the
		// right edge.
		const newCategories = Array.from({ length: 16 }, (_, i) => ({
			type: 'category' as const,
			name: `Cat${String(i + 1).padStart(2, '0')}`,
			row: i % 3,
		}));
		await seedFixture({
			entities: [
				{ type: 'account', name: 'Acct03', icon: 'credit-card' },
				{ type: 'account', name: 'Acct04', icon: 'credit-card' },
				{ type: 'account', name: 'Acct05', icon: 'credit-card' },
				{ type: 'account', name: 'Acct06', icon: 'credit-card' },
				{ type: 'account', name: 'Acct07', icon: 'credit-card' },
				{ type: 'account', name: 'Acct08', icon: 'credit-card' },
				...newCategories,
			],
		});

		// Make sure the seeded accounts have rendered before the sanity
		// check below. Acct08 is the last seeded account; if it's in the
		// view hierarchy, all earlier ones (including the Acct03 drop
		// target) are too. Without this, `.not.toBeVisible()` passes
		// vacuously while bubbles are still hydrating and the drag then
		// races a half-mounted row.
		await waitFor(element(by.id(TestIDs.entityBubble('Acct08'))))
			.toExist()
			.withTimeout(5000);

		// Sanity: Acct08 starts off the right edge.
		await waitFor(element(by.id(TestIDs.entityBubble('Acct08'))))
			.not.toBeVisible()
			.withTimeout(2000);

		// On Android a drag near the top edge opens the notification shade.
		await element(by.id(TestIDs.homeScrollView)).scroll(150, 'down');

		// Drag the category onto the rightmost visible account
		// (Acct03 — column 3, at x≈316-412 dp; Acct04 starts past
		// Pixel_9a's 411 dp viewport and is unreachable). Touch lands
		// at targetX=0.99 so it falls inside the 60 dp right-edge
		// auto-scroll zone. `holdDuration=4000` gives auto-scroll
		// plenty of time to chew through the row's overflow.
		await element(by.id(TestIDs.entityBubble('Groceries'))).longPressAndDrag(
			600,
			0.5,
			0.5,
			element(by.id(TestIDs.entityBubble('Acct03'))),
			0.99,
			0.5,
			'slow',
			4000
		);

		// Drop may have landed on a real account — close any refund picker.
		try {
			await waitFor(element(by.id(TestIDs.refundPicker.modal)))
				.toBeVisible()
				.withTimeout(1500);
			await element(by.id(TestIDs.refundPicker.close)).tap();
			await waitFor(element(by.id(TestIDs.refundPicker.modal)))
				.not.toBeVisible()
				.withTimeout(3000);
		} catch {
			// No modal — fine.
		}

		// Acct08 should be on screen now: the Accounts row auto-scrolled
		// while the finger held at the right edge.
		await waitFor(element(by.id(TestIDs.entityBubble('Acct08'))))
			.toBeVisible()
			.withTimeout(3000);
	});
});
