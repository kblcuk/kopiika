import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useStore } from '@/src/store';
import type { Transaction } from '@/src/types';
import { earlyConfirmPrompt } from '@/src/utils/early-confirm';

/**
 * The single confirm path, shared by the transaction row's Confirm pill and the
 * edit modal's "Confirm now" button (KII-159).
 *
 * A virtual occurrence is materialized first, so the normal id-based confirm can
 * operate on a real row. Confirming AHEAD of the scheduled date also rewrites the
 * date to today — the money moved today, and that is what the balances should
 * reflect. The row keeps its deterministic `${seriesId}:${civilDate}` id, so it
 * still occupies its original occurrence slot and the moved date can neither
 * resurrect nor duplicate the occurrence (KII-157).
 *
 * Confirmation never asks for a series scope: it applies to one occurrence by
 * construction (KII-106).
 */
export function useConfirmTransaction(): (transaction: Transaction) => Promise<void> {
	const confirmTransaction = useStore((state) => state.confirmTransaction);
	const updateTransaction = useStore((state) => state.updateTransaction);
	const materializeOccurrence = useStore((state) => state.materializeOccurrence);

	return useCallback(
		async (transaction: Transaction) => {
			const now = Date.now();
			const prompt = earlyConfirmPrompt(transaction.timestamp, now);

			const run = async () => {
				try {
					if (transaction.isVirtual) await materializeOccurrence(transaction);
					if (prompt) await updateTransaction(transaction.id, { timestamp: now });
					await confirmTransaction(transaction.id);
				} catch (error) {
					console.error('Failed to confirm transaction:', error);
					Alert.alert(
						'Confirm failed',
						'Could not confirm this transaction. Please try again.'
					);
				}
			};

			if (!prompt) {
				await run();
				return;
			}

			Alert.alert(
				'Confirm early?',
				`Scheduled for ${prompt.scheduledLabel}. Record it as today, ${prompt.todayLabel}?`,
				[
					{ text: 'Cancel', style: 'cancel' },
					{
						text: 'Confirm',
						onPress: () => {
							void run();
						},
					},
				]
			);
		},
		[confirmTransaction, updateTransaction, materializeOccurrence]
	);
}
