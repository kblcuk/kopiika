import { by, device, element, expect, waitFor } from 'detox';
import { TestIDs } from '../support/test-ids';
import { seedFixture } from '../support/fixture';
import { ensureHomeScreen, launchAppFast } from '../support/helpers';

// KII-152. The Categories grid asks react-native-sortables for only as many
// rows as it needs, so `rows` changes as categories are added. The library
// reacts to that by running `resetMeasurements()` from a useLayoutEffect on its
// `groups` prop, which nulls the measured itemWidths a horizontal grid lays out
// from; nothing re-measures, because the existing item views keep their size and
// never fire onLayout again. Every bubble then falls into the library's
// `HIDDEN_STYLE` (`left: 9999`) and is invisible until the app restarts.
//
// This is unreachable below e2e: react-native-sortables runs unmocked in jest,
// but jest has no native layout, so item widths are never measured there and the
// broken state cannot be reproduced.
//
// The assertion must stay `toBeVisible()`. A hidden bubble is still mounted and
// still in the view hierarchy, so `toExist()` passes on the broken build and
// catches nothing.
describe('Board — category grid row growth', () => {
	beforeAll(async () => {
		await launchAppFast();
	});

	beforeEach(async () => {
		await ensureHomeScreen();
	});

	it('keeps bubbles visible when a new category grows the grid by a row', async () => {
		// One category means a one-row grid; adding the second is what moves
		// `rows` 1 -> 2 and used to blank the section. `launchAppFast` in the next
		// suite re-seeds the presets that clearEntities removes.
		await seedFixture({
			clearEntities: true,
			entities: [
				// seedFixture anchors on a visible `Main Card` bubble to know the grid
				// has hydrated, so a clearEntities payload has to re-seed it. Nothing
				// in this test touches the account.
				{ type: 'account', name: 'Main Card', icon: 'credit-card' },
				{ type: 'category', name: 'RowOne', icon: 'shopping-cart' },
			],
		});
		// Relaunch before acting. clearEntities removes the preset categories one
		// at a time, which walks `rows` 3 -> 2 -> 1 and already trips the bug, so
		// without a fresh mount the section arrives damaged and the test fails at
		// the tap below instead of at its assertion. Remounting isolates the one
		// transition under test: the 1 -> 2 growth caused by creating a category.
		await device.launchApp({ newInstance: true });
		await device.disableSynchronization();
		await waitFor(element(by.id(TestIDs.entityBubble('RowOne'))))
			.toBeVisible()
			.withTimeout(10000);

		await element(by.id(TestIDs.addEntityButton('category'))).tap();
		// Synchronization is off suite-wide, so wait the modal in rather than
		// assuming it mounted by the time the tap returns.
		await waitFor(element(by.id(TestIDs.entityCreate.nameInput)))
			.toBeVisible()
			.withTimeout(5000);
		await element(by.id(TestIDs.entityCreate.nameInput)).typeText('RowTwo');
		// Create sits in the modal header, above the keyboard, and stays disabled
		// until the name is non-empty — hence typing first.
		await element(by.id(TestIDs.entityCreate.saveButton)).tap();

		// The new bubble has to be on screen without a relaunch.
		await waitFor(element(by.id(TestIDs.entityBubble('RowTwo'))))
			.toBeVisible()
			.withTimeout(5000);

		// ...and the row that was already there must survive the regrow: the
		// failure blanked every bubble in the section, not just the new one.
		await expect(element(by.id(TestIDs.entityBubble('RowOne')))).toBeVisible();
	});
});
