import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';

import {
	PRESET_CHIPS,
	createEntitiesFromPresets,
	createPlansForEntities,
} from '@/src/onboarding/presets';
import { useStore } from '@/src/store';
import { setEmptyBoardNudgeDismissed, setHasCompletedOnboarding } from '@/src/utils/app-prefs';
import { isEntityActive } from '@/src/utils/entity-display';

// Accessible only in E2E builds (built with EXPO_PUBLIC_E2E=true).
// Marks onboarding as complete AND seeds the full PRESET_CHIPS catalog
// (income, accounts, categories, savings) so existing E2E suites land in the
// same world they had before onboarding existed. Test suites that depend on
// specific entity names (Salary, Main Card, Cash, Groceries, Transport,
// Coffee, Entertainment, Vacation, Emergency Fund, ...) don't have to seed
// them individually.
//
// Usage: device.openURL({ url: 'kopiika://e2e/skip-onboarding' })

export default function E2ESkipOnboardingScreen() {
	useEffect(() => {
		async function run() {
			try {
				await setHasCompletedOnboarding(true);
				// Suppress the empty-board nudge in E2E. It mounts async (reads its
				// dismissed flag from AsyncStorage in a useEffect), and on a fresh
				// install that delayed mount shifts the home layout right when the
				// first test reads a category amount — flipping it from 75 % visible
				// to under threshold and making getAmount('Groceries') flake.
				await setEmptyBoardNudgeDismissed(true);

				const addEntity = useStore.getState().addEntity;
				const setPlan = useStore.getState().setPlan;
				const appCurrency = useStore.getState().appCurrency;
				// Use only active entities when computing "missing". `useStore`
				// holds raw entities including soft-deleted ones (getAllEntities
				// doesn't filter), so after a clearEntities fixture call the
				// preset names still match soft-deleted rows and nothing gets
				// re-seeded — leaving subsequent tests without Groceries / Cash /
				// etc.
				const existing = useStore.getState().entities.filter(isEntityActive);

				// Idempotent: only seed chips that aren't already present.
				const missing = PRESET_CHIPS.filter(
					(c) => !existing.some((e) => e.type === c.type && e.name === c.name)
				);
				if (missing.length > 0) {
					const entities = createEntitiesFromPresets(missing, appCurrency);
					const entityToPreset = new Map(
						entities.map((e) => [
							e.id,
							missing.find((c) => c.name === e.name && c.type === e.type)!,
						])
					);
					const plans = createPlansForEntities(entities, entityToPreset, appCurrency);
					for (const entity of entities) await addEntity(entity);
					for (const plan of plans) await setPlan(plan);
				}
				router.replace('/(tabs)');
			} catch (e) {
				console.error('[E2E skip-onboarding] error:', e);
			}
		}
		void run();
	}, []);

	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<Text>Skipping onboarding…</Text>
		</View>
	);
}
