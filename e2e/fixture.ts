import { device, waitFor, element, by } from 'detox';
import { TestIDs } from './test-ids';

type TxFixture = { from: string; to: string; amount: number };

/**
 * Seeds transaction fixtures directly into the app's SQLite database.
 *
 * Opens the E2E fixture route (only available in EXPO_PUBLIC_E2E=true builds),
 * waits for it to finish seeding and navigate back to the home screen.
 *
 * @example
 * await seedFixture([
 *   { from: 'Main Card', to: 'Groceries', amount: 55.00 },
 *   { from: 'Salary',    to: 'Main Card', amount: 200.00 },
 * ]);
 */
export async function seedFixture(transactions: TxFixture[]) {
	const encoded = Buffer.from(JSON.stringify(transactions)).toString('base64');
	await device.openURL({ url: `kopiika://e2e/fixture?data=${encoded}` });
	await waitFor(element(by.id(TestIDs.homeScreen))).toBeVisible().withTimeout(15000);
	// router.replace() transition animation can briefly leave two home screens mounted;
	// wait for the old instance to fully unmount before interacting with elements.
	await new Promise((r) => setTimeout(r, 1000));
}
