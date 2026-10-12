import { useShallow } from 'zustand/react/shallow';
import { useStore, useEntitiesWithBalance } from '@/src/store';
import { EntityDetailForm, type EntityDetailFormProps } from './entity-detail-form';
export function EntityDetailModal(props: Omit<EntityDetailFormProps, 'bindings' | 'practice'>) {
	const data = useStore(
		useShallow((s) => ({
			plans: s.plans,
			currentPeriod: s.currentPeriod,
			transactions: s.transactions,
			entities: s.entities,
			setPlan: s.setPlan,
			deletePlan: s.deletePlan,
			deleteEntity: s.deleteEntity,
			updateEntity: s.updateEntity,
			updateEntityWithOptions: s.updateEntityWithOptions,
			addTransaction: s.addTransaction,
			setDefaultAccount: s.setDefaultAccount,
			recurrenceTemplates: s.recurrenceTemplates,
			deactivateTemplatesForEntity: s.deactivateTemplatesForEntity,
			addMarketValueSnapshot: s.addMarketValueSnapshot,
			marketValueSnapshots: s.marketValueSnapshots,
			reserveToSaving: s.reserveToSaving,
		}))
	);
	const accounts = useEntitiesWithBalance('account');
	const savings = useEntitiesWithBalance('saving');
	return <EntityDetailForm {...props} bindings={{ ...data, accounts, savings }} />;
}
