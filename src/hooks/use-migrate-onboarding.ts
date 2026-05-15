import { useEffect, useRef } from 'react';

import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { useStore } from '@/src/store';
import { getHasCompletedOnboarding, setHasCompletedOnboarding } from '@/src/utils/app-prefs';

/**
 * Existing-user migration.
 *
 * Runs once after fonts are loaded and the store has hydrated. If the
 * completion flag is unset but the DB already has real (non-system)
 * entities, mark the flag true so an existing tester never sees the new
 * onboarding flow. Fresh installs (no user entities) are left untouched —
 * the (tabs) layout gate redirects them into /onboarding/welcome.
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
