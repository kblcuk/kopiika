import type { ReactNode } from 'react';
import type { EntityWithBalance } from '@/src/types';
import { outsideExercise } from '@/src/onboarding/practice-session';
import { EntityDetailForm } from './entity-detail-form';

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
