import { useCallback, useMemo, useState } from 'react';

import type { EntityWithBalance } from '@/src/types';

interface ReservationModalProps {
	visible: boolean;
	account: EntityWithBalance | null;
	saving: EntityWithBalance | null;
	onClose: () => void;
}

export interface UseReservationFlow {
	/** Open the reservation modal for an account → saving reservation. */
	open: (account: EntityWithBalance, saving: EntityWithBalance) => void;
	reservationModalProps: ReservationModalProps;
}

/**
 * Owns the reservation modal (account → saving). Independent of the other board
 * flows — it shares only the drop entry point, which is dispatched by the screen.
 */
export function useReservationFlow(): UseReservationFlow {
	const [visible, setVisible] = useState(false);
	const [account, setAccount] = useState<EntityWithBalance | null>(null);
	const [saving, setSaving] = useState<EntityWithBalance | null>(null);

	const open = useCallback((nextAccount: EntityWithBalance, nextSaving: EntityWithBalance) => {
		setAccount(nextAccount);
		setSaving(nextSaving);
		setVisible(true);
	}, []);

	const handleClose = useCallback(() => {
		setVisible(false);
		setAccount(null);
		setSaving(null);
	}, []);

	const reservationModalProps = useMemo<ReservationModalProps>(
		() => ({ visible, account, saving, onClose: handleClose }),
		[visible, account, saving, handleClose]
	);

	return { open, reservationModalProps };
}
