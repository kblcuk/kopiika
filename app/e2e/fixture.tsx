import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { getAllEntities } from '@/src/db/entities';
import { createTransaction } from '@/src/db/transactions';
import { generateId } from '@/src/utils/ids';
import { DEFAULT_CURRENCY } from '@/src/utils/format';

// Accessible only in E2E builds (built with EXPO_PUBLIC_E2E=true).
// Seeds fixture transactions into the DB and redirects to home.
//
// Usage from Detox: device.openURL({ url: 'kopiika://e2e/fixture?data=BASE64' })
// where BASE64 = btoa(JSON.stringify([{ from, to, amount }, ...]))

type TxFixture = { from: string; to: string; amount: number };

export default function E2EFixtureScreen() {
	const { data } = useLocalSearchParams<{ data: string }>();

	useEffect(() => {
		async function seed() {
			try {
				const fixtures: TxFixture[] = JSON.parse(atob(data ?? 'W10='));
				const allEntities = await getAllEntities();
				const byName = Object.fromEntries(allEntities.map((e) => [e.name, e]));

				for (const tx of fixtures) {
					const from = byName[tx.from];
					const to = byName[tx.to];
					if (!from || !to) {
						console.error(`[E2E fixture] entity not found: "${tx.from}" or "${tx.to}"`);
						continue;
					}
					await createTransaction({
						id: generateId(),
						from_entity_id: from.id,
						to_entity_id: to.id,
						amount: tx.amount,
						currency: DEFAULT_CURRENCY,
						timestamp: Date.now(),
						note: null,
					});
				}
			} catch (e) {
				console.error('[E2E fixture] seed error:', e);
			}

			router.replace('/(tabs)');
		}

		void seed();
	}, [data]);

	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<Text>Seeding fixtures…</Text>
		</View>
	);
}
