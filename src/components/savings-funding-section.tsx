import { forwardRef } from 'react';
import { useStore } from '@/src/store';
import {
	SavingsFundingForm,
	type SavingsFundingSectionProps,
	type SavingsFundingHandle,
} from './savings-funding-form';
export type { SavingsFundingHandle } from './savings-funding-form';
export const SavingsFundingSection = forwardRef<SavingsFundingHandle, SavingsFundingSectionProps>(
	function SavingsFundingSection(props, ref) {
		const transactions = useStore((s) => s.transactions);
		const entities = useStore((s) => s.entities);
		return (
			<SavingsFundingForm
				{...props}
				ref={ref}
				transactions={transactions}
				entities={entities}
			/>
		);
	}
);
