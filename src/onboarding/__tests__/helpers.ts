import { PRESET_CHIPS, createEntitiesFromPresets, createPlansForEntities } from '../presets';
import { useStore } from '@/src/store';

/**
 * Seed the in-memory store with the full default-selected preset world.
 * For use in component/screen tests that don't care about specifics.
 */
export async function seedDefaultWorld(): Promise<void> {
	const { addEntity, setPlan, appCurrency } = useStore.getState();
	const defaults = PRESET_CHIPS.filter((c) => c.defaultSelected);
	const entities = createEntitiesFromPresets(defaults, appCurrency);
	const entityToPreset = new Map(entities.map((e, i) => [e.id, defaults[i]!]));
	const plans = createPlansForEntities(entities, entityToPreset, appCurrency);

	for (const e of entities) await addEntity(e);
	for (const p of plans) await setPlan(p);
}
