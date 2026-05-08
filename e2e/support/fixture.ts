import { device, waitFor, element, by } from 'detox';
import { TestIDs } from './test-ids';

export type TxFixture = {
	from: string;
	to: string;
	amount: number;
	/** Optional series id — marks the transaction as part of a recurring series. */
	seriesId?: string;
	/** When false, the transaction lands in the "Needs Confirmation" bucket. */
	isConfirmed?: boolean;
	/** Offset from Date.now() in ms. Negative => past, positive => future. */
	timestampOffsetMs?: number;
};
export type EntityFixture = {
	type: 'income' | 'account' | 'category' | 'saving';
	name: string;
	icon?: string;
	/** Visual row within the section (Categories use 3 rows; others use 1). Defaults to 0. */
	row?: number;
};
export type FixturePayload = {
	entities?: EntityFixture[];
	transactions?: TxFixture[];
};

/**
 * Seeds entity and transaction fixtures directly into the app's SQLite database.
 *
 * Opens the E2E fixture route (only available in EXPO_PUBLIC_E2E=true builds),
 * waits for it to finish seeding and navigate back to the home screen.
 *
 * Accepts either the legacy transactions-only array or the richer payload
 * `{ entities, transactions }`. Entities are created before transactions so
 * later transactions can reference newly seeded names.
 *
 * @example
 * await seedFixture([{ from: 'Main Card', to: 'Groceries', amount: 55 }]);
 *
 * @example
 * await seedFixture({
 *   entities: [{ type: 'account', name: 'Bank A' }],
 *   transactions: [{ from: 'Bank A', to: 'Groceries', amount: 12 }],
 * });
 */
export async function seedFixture(input: TxFixture[] | FixturePayload) {
	const payload: FixturePayload = Array.isArray(input) ? { transactions: input } : input;
	const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
	await device.openURL({ url: `kopiika://e2e/fixture?data=${encoded}` });
	await waitFor(element(by.id(TestIDs.homeScreen)))
		.toBeVisible()
		.withTimeout(15000);
	// Anchor to a default-seeded bubble so the home grid has hydrated before
	// callers issue gestures or read amounts.
	await waitFor(element(by.id(TestIDs.entityBubble('Main Card'))))
		.toBeVisible()
		.withTimeout(5000);
}
