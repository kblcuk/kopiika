import { useEffect, useRef, useState } from 'react';

import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { useStore } from '@/src/store';
import { getHasCompletedOnboarding } from '@/src/utils/app-prefs';

export type OnboardingGate = 'unknown' | 'show-tabs' | 'redirect';

/**
 * One-shot decision after store hydration. We deliberately do not subscribe to
 * `entities` — once the gate is decided, later entity mutations (e.g. the user
 * deleting their last account) must not flip the gate back to 'redirect' and
 * pull them out of the app mid-session.
 */
export function useOnboardingGate(): OnboardingGate {
	const isLoading = useStore((s) => s.isLoading);
	const [gate, setGate] = useState<OnboardingGate>('unknown');
	const decided = useRef(false);

	useEffect(() => {
		if (isLoading || decided.current) return;
		let cancelled = false;
		void (async () => {
			const done = await getHasCompletedOnboarding();
			if (cancelled) return;
			decided.current = true;
			if (done) {
				setGate('show-tabs');
				return;
			}
			const entities = useStore.getState().entities;
			const userEntities = entities.filter((e) => e.id !== BALANCE_ADJUSTMENT_ENTITY_ID);
			setGate(userEntities.length > 0 ? 'show-tabs' : 'redirect');
		})();
		return () => {
			cancelled = true;
		};
	}, [isLoading]);

	return gate;
}
