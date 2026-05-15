import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';

import {
	PRESET_CHIPS,
	createEntitiesFromPresets,
	createPlansForEntities,
} from '@/src/onboarding/presets';
import { useStore } from '@/src/store';
import { setHasCompletedOnboarding } from '@/src/utils/app-prefs';

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

				const addEntity = useStore.getState().addEntity;
				const setPlan = useStore.getState().setPlan;
				const existing = useStore.getState().entities;

				// Idempotent: only seed chips that aren't already present.
				const missing = PRESET_CHIPS.filter(
					(c) => !existing.some((e) => e.type === c.type && e.name === c.name)
				);
				if (missing.length > 0) {
					const entities = createEntitiesFromPresets(missing);
					const entityToPreset = new Map(
						entities.map((e) => [
							e.id,
							missing.find((c) => c.name === e.name && c.type === e.type)!,
						])
					);
					const plans = createPlansForEntities(entities, entityToPreset);
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
