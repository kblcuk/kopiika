import { useCallback, useMemo, useState } from 'react';

import type { EntityType } from '@/src/types';

export interface UseSectionEditModes {
	/** Current edit-mode flag per section, keyed by entity type. */
	modes: Record<EntityType, boolean>;
	/** Toggle handler per section, keyed by entity type. */
	toggle: Record<EntityType, () => void>;
	/**
	 * Whether the section for `type` is in edit mode. In edit mode a tap opens the
	 * detail modal and a drag reorders locally instead of starting a transaction —
	 * so this doubles as the "is this drag a reorder?" predicate.
	 */
	isEditing: (type: EntityType) => boolean;
}

/**
 * Owns the per-section edit-mode toggles for the home board. Edit mode changes
 * how taps and drags behave (detail/reorder vs. navigate/transaction); the screen
 * reads {@link UseSectionEditModes.isEditing} to branch and feeds `modes`/`toggle`
 * straight into each section grid.
 */
export function useSectionEditModes(): UseSectionEditModes {
	const [incomeEditMode, setIncomeEditMode] = useState(false);
	const [accountsEditMode, setAccountsEditMode] = useState(false);
	const [categoriesEditMode, setCategoriesEditMode] = useState(false);
	const [savingsEditMode, setSavingsEditMode] = useState(false);

	const modes = useMemo<Record<EntityType, boolean>>(
		() => ({
			income: incomeEditMode,
			account: accountsEditMode,
			category: categoriesEditMode,
			saving: savingsEditMode,
		}),
		[incomeEditMode, accountsEditMode, categoriesEditMode, savingsEditMode]
	);

	const toggleIncome = useCallback(() => setIncomeEditMode((prev) => !prev), []);
	const toggleAccount = useCallback(() => setAccountsEditMode((prev) => !prev), []);
	const toggleCategory = useCallback(() => setCategoriesEditMode((prev) => !prev), []);
	const toggleSaving = useCallback(() => setSavingsEditMode((prev) => !prev), []);

	const toggle = useMemo<Record<EntityType, () => void>>(
		() => ({
			income: toggleIncome,
			account: toggleAccount,
			category: toggleCategory,
			saving: toggleSaving,
		}),
		[toggleIncome, toggleAccount, toggleCategory, toggleSaving]
	);

	const isEditing = useCallback((type: EntityType) => modes[type], [modes]);

	return { modes, toggle, isEditing };
}
