import type { EntityWithBalance } from '@/src/types';
import { useStore } from '@/src/store';
import { getReservationForPair } from '@/src/utils/savings-transactions';
import { InfoPin } from './info-pin';
import { ReservationForm } from './reservation-form';
interface ReservationModalProps {
	visible: boolean;
	account: EntityWithBalance | null;
	saving: EntityWithBalance | null;
	onClose: () => void;
}
export function ReservationModal(props: ReservationModalProps) {
	const reserve = useStore((s) => s.reserveToSaving);
	const transactions = useStore((s) => s.transactions);
	const { account, saving } = props;
	const currentNetMinor =
		account && saving ? getReservationForPair(transactions, account.id, saving.id) : 0;
	return (
		<ReservationForm
			{...props}
			currentNetMinor={currentNetMinor}
			help={<InfoPin articleId="reservations" />}
			onSubmit={(n) =>
				account && saving ? reserve(account.id, saving.id, n) : Promise.resolve()
			}
		/>
	);
}
