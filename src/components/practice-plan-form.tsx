import type { ReactNode } from 'react';
import type { EntityWithBalance } from '@/src/types';
import { EntityDetailForm } from './entity-detail-form';
const outsideExercise = async (): Promise<never> => {
	throw new Error('This option is outside the planning exercise.');
};
export function PracticePlanForm({
	visible,
	entity,
	period,
	initialPlannedMinor,
	onSubmit,
	onClose,
	tutorialHeader,
	guidance,
}: {
	visible: boolean;
	entity: EntityWithBalance;
	period: string;
	initialPlannedMinor: number;
	onSubmit: (amount: number) => Promise<void>;
	onClose: () => void;
	tutorialHeader?: ReactNode;
	guidance?: ReactNode;
}) {
	return (
		<EntityDetailForm
			visible={visible}
			entity={entity}
			onClose={onClose}
			practice={{ initialPlannedMinor, onSubmit, header: tutorialHeader, guidance }}
			bindings={{
				plans: [],
				currentPeriod: period,
				transactions: [],
				entities: [entity],
				accounts: [],
				savings: [],
				recurrenceTemplates: [],
				marketValueSnapshots: [],
				setPlan: outsideExercise,
				deletePlan: outsideExercise,
				deleteEntity: outsideExercise,
				updateEntity: outsideExercise,
				updateEntityWithOptions: outsideExercise,
				addTransaction: outsideExercise,
				setDefaultAccount: outsideExercise,
				deactivateTemplatesForEntity: outsideExercise,
				addMarketValueSnapshot: outsideExercise,
				reserveToSaving: outsideExercise,
			}}
		/>
	);
}
