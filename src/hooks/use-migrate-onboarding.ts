import { useEffect, useRef } from 'react';

import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { useStore } from '@/src/store';
import { getHasCompletedOnboarding, setHasCompletedOnboarding } from '@/src/utils/app-prefs';

/**
 * Silently marks existing users as having completed onboarding.
 *
 * Runs once after fonts are loaded and the store has finished hydrating.
 * If the flag is already set, does nothing. If there are real (non-system)
 * entities in the DB, sets the flag to true so existing users never see
 * the new onboarding flow when it lands in a later task.
 *
 * Fresh installs (no user entities) are left untouched — they will go
 * through onboarding when the flow is ready.
 */
export function useMigrateOnboarding(fontsLoaded: boolean): void {
	const isLoading = useStore((s) => s.isLoading);
	const entities = useStore((s) => s.entities);
	const ran = useRef(false);

	useEffect(() => {
		if (!fontsLoaded || isLoading || ran.current) return;
		ran.current = true;
		void (async () => {
			const done = await getHasCompletedOnboarding();
			if (done) return;
			const userEntities = entities.filter((e) => e.id !== BALANCE_ADJUSTMENT_ENTITY_ID);
			if (userEntities.length > 0) {
				await setHasCompletedOnboarding(true);
			}
		})();
	}, [fontsLoaded, isLoading, entities]);
}
