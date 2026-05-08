import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { getAllEntities, getNextPosition } from '@/src/db/entities';
import { generateId } from '@/src/utils/ids';
import { DEFAULT_CURRENCY } from '@/src/utils/format';
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
	amount: number;
	/** Optional series id — marks the transaction as part of a recurring series. */
	seriesId?: string;
	/** When false, the transaction lands in the "Needs Confirmation" bucket. */
	isConfirmed?: boolean;
	/** Offset from Date.now() in ms. Negative => past, positive => future. */
	timestampOffsetMs?: number;
};
type EntityFixture = { type: EntityType; name: string; icon?: string; row?: number };
type FixturePayload = { entities?: EntityFixture[]; transactions?: TxFixture[] };

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
				const { addEntity, addTransaction } = useStore.getState();
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
						amount: tx.amount,
						currency: DEFAULT_CURRENCY,
						timestamp: Date.now() + (tx.timestampOffsetMs ?? 0),
						note: null,
						series_id: tx.seriesId,
						is_confirmed: tx.isConfirmed,
					};
					await addTransaction(transaction);
					// Push into the in-memory store so the History/Home screens see
					// the seeded transaction without an app relaunch — entity bubbles
					// re-render from `useStore`, not the DB.
					useStore.setState((state) => ({
						transactions: [transaction, ...state.transactions],
					}));
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
