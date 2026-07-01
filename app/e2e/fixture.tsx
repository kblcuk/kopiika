import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { getAllEntities, getNextPosition } from '@/src/db/entities';
import { generateId } from '@/src/utils/ids';
import { DEFAULT_CURRENCY } from '@/src/utils/format';
import { toMinor } from '@/src/utils/money';
import { setHasCompletedOnboarding } from '@/src/utils/app-prefs';
import { useStore } from '@/src/store';
import type { EntityType, Transaction } from '@/src/types';

// Accessible only in E2E builds (built with EXPO_PUBLIC_E2E=true).
// Seeds fixture entities and transactions into the DB and redirects to home.
//
// Usage from Detox: device.openURL({ url: 'kopiika://e2e/fixture?data=BASE64' })
// where BASE64 = btoa(JSON.stringify(payload)). The payload is either:
//   - TxFixture[]                                  (legacy: just transactions)
//   - { entities?: EntityFixture[]; transactions?: TxFixture[] }

type TxFixture = {
	from: string;
	to: string;
	// Authored as a major-unit value (e.g. 55.00 = €55); converted to integer
	// minor units (KII-120) at seed time.
	amount: number;
	/** Optional series id — marks the transaction as part of a recurring series. */
	seriesId?: string;
	/** When false, the transaction lands in the "Needs Confirmation" bucket. */
	isConfirmed?: boolean;
	/** Offset from Date.now() in ms. Negative => past, positive => future. */
	timestampOffsetMs?: number;
};
type EntityFixture = { type: EntityType; name: string; icon?: string; row?: number };
type FixturePayload = {
	entities?: EntityFixture[];
	transactions?: TxFixture[];
	/**
	 * When true, deletes all non-system entities (and their plans) before
	 * seeding. Useful for tests that need a minimal entity set so the home
	 * grid fits in a smaller viewport.
	 */
	clearEntities?: boolean;
	/**
	 * When true, deletes every existing transaction before seeding. Tests in a
	 * jest worker share DB state (no relaunch wipes it), and `jest.retryTimes`
	 * re-runs the body on failure — so a seedFixture test that doesn't clear
	 * accumulates duplicate rows on retry, turning unique-row assertions into
	 * "multiple elements found". Set this for tests that assert on exactly the
	 * rows they seed.
	 */
	clearTransactions?: boolean;
};

export default function E2EFixtureScreen() {
	const { data } = useLocalSearchParams<{ data: string }>();

	useEffect(() => {
		async function seed() {
			try {
				const parsed = JSON.parse(atob(data ?? 'W10='));
				const payload: FixturePayload = Array.isArray(parsed)
					? { transactions: parsed }
					: parsed;

				await setHasCompletedOnboarding(true);
				// Use the store's addEntity / addTransaction actions: they write
				// the DB AND update the in-memory arrays. Direct db.* calls would
				// persist but the home screen wouldn't reflect the changes, since
				// the store hydrates only at app launch.
				const { addEntity, addTransaction, deleteEntity, deleteTransaction } =
					useStore.getState();

				if (payload.clearTransactions) {
					// Snapshot ids first — deleteTransaction mutates the store array.
					const ids = useStore.getState().transactions.map((t) => t.id);
					for (const id of ids) {
						await deleteTransaction(id);
					}
				}

				if (payload.clearEntities) {
					const existing = useStore.getState().entities;
					for (const e of existing) {
						if (e.id === BALANCE_ADJUSTMENT_ENTITY_ID) continue;
						await deleteEntity(e.id);
					}
				}

				for (const e of payload.entities ?? []) {
					const row = e.row ?? 0;
					const position = await getNextPosition(e.type, row);
					await addEntity({
						id: generateId(),
						type: e.type,
						name: e.name,
						currency: DEFAULT_CURRENCY,
						icon: e.icon ?? 'circle',
						row,
						position,
						order: 0,
					});
				}

				const allEntities = await getAllEntities();
				const byName = Object.fromEntries(allEntities.map((e) => [e.name, e]));

				for (const tx of payload.transactions ?? []) {
					const from = byName[tx.from];
					const to = byName[tx.to];
					if (!from || !to) {
						console.error(`[E2E fixture] entity not found: "${tx.from}" or "${tx.to}"`);
						continue;
					}

					const transaction: Transaction = {
						id: generateId(),
						from_entity_id: from.id,
						to_entity_id: to.id,
						amount_minor: toMinor(tx.amount, DEFAULT_CURRENCY),
						currency: DEFAULT_CURRENCY,
						timestamp: Date.now() + (tx.timestampOffsetMs ?? 0),
						note: null,
						series_id: tx.seriesId,
						is_confirmed: tx.isConfirmed,
					};
					// addTransaction writes the DB AND prepends the created row to the
					// in-memory store, so the History/Home screens reflect the seed
					// without an app relaunch. Do NOT also setState the raw row here:
					// that double-inserts the same id, and since the history list does
					// no id-dedup (candidates = [...transactions, ...virtual]) the
					// SectionList renders two rows per seeded transaction — breaking
					// unique-row matchers ("multiple elements found").
					await addTransaction(transaction);
				}
			} catch (e) {
				console.error('[E2E fixture] seed error:', e);
			}

			// Pop the deep-linked fixture screen back to the home that's
			// already on the stack. router.replace('/(tabs)') would push a
			// *new* home and leave the original mounted alongside it —
			// duplicate `Sortable.PortalProvider`s break the drag visual lift
			// and split SharedValue state across two `useDragAutoScroll`
			// hooks (KII-97 diagnosis).
			if (router.canDismiss()) {
				router.dismiss();
			} else {
				router.replace('/(tabs)');
			}
		}

		void seed();
	}, [data]);

	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<Text>Seeding fixtures…</Text>
		</View>
	);
}
