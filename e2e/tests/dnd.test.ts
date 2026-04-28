import { waitFor, element, by } from 'detox';
import { TestIDs } from '../support/test-ids';
import { seedFixture } from '../support/fixture';
import {
	createTransactionViaDnD,
	dnd,
	ensureHomeScreen,
	expectAmount,
	expectNoTransactionModal,
	getAmount,
	launchFreshAndDismissOverlays,
} from '../support/helpers';

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
		await launchFreshAndDismissOverlays();
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

	// ── Reservation flow ─────────────────────────────────────────────────────

	it('DnD Account → Saving: opens reservation modal, not transaction modal', async () => {
		await dnd('Main Card', 'Vacation');

		await waitFor(element(by.id(TestIDs.reservation.modal)))
			.toBeVisible()
			.withTimeout(5000);
	});

	// ── Blocked drag ─────────────────────────────────────────────────────────

	it('DnD Category → Category: blocked — no transaction modal appears', async () => {
		await dnd('Groceries', 'Transport');
		await expectNoTransactionModal();
	});
});
