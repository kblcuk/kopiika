import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';

import { getIcon } from '@/src/constants/icon-registry';
import type { Entity, Transaction } from '@/src/types';
import { colors } from '@/src/theme/colors';
import { getEntityDisplayName } from '@/src/utils/entity-display';
import { getEntityColors } from '@/src/utils/entity-colors';
import { formatAmount } from '@/src/utils/format';
import {
	getReservationsForAccount,
	getReservationsForSaving,
} from '@/src/utils/savings-transactions';
import { Text } from './text';

interface ReservationSummaryProps {
	selectedEntity: Entity | null;
	entities: Entity[];
	transactions: Transaction[];
}

interface ReservationSummaryData {
	emptyText: string;
	rows: { entity: Entity; amount: number }[];
	total: number;
}

export function ReservationSummary({
	selectedEntity,
	entities,
	transactions,
}: ReservationSummaryProps) {
	const [expanded, setExpanded] = useState(true);

	const summary = useMemo<ReservationSummaryData | null>(() => {
		if (!selectedEntity) return null;

		if (selectedEntity.type === 'account') {
			const rows = getReservationsForAccount(transactions, entities, selectedEntity.id)
				.map(({ savingEntityId, amount }) => {
					const entity = entities.find((e) => e.id === savingEntityId);
					return entity ? { entity, amount } : null;
				})
				.filter(Boolean) as { entity: Entity; amount: number }[];

			return {
				emptyText: 'No savings reservations from this account',
				rows,
				total: rows.reduce((sum, row) => sum + row.amount, 0),
			};
		}

		if (selectedEntity.type === 'saving') {
			const rows = getReservationsForSaving(transactions, entities, selectedEntity.id)
				.map(({ accountEntityId, amount }) => {
					const entity = entities.find((e) => e.id === accountEntityId);
					return entity ? { entity, amount } : null;
				})
				.filter(Boolean) as { entity: Entity; amount: number }[];

			return {
				label: 'Reserved from',
				emptyText: 'No accounts are reserving into this saving',
				rows,
				total: rows.reduce((sum, row) => sum + row.amount, 0),
			};
		}

		return null;
	}, [entities, selectedEntity, transactions]);

	if (!summary || !selectedEntity) return null;

	const Chevron = expanded ? ChevronDown : ChevronRight;

	return (
		<View className="px-5 py-3" testID="reservation-summary">
			<View className="overflow-hidden rounded-lg border border-paper-300 bg-paper-100">
				<Pressable
					onPress={() => setExpanded((value) => !value)}
					accessibilityRole="button"
					accessibilityState={{ expanded }}
					className="min-h-[56px] flex-row items-center justify-between px-4 py-3 active:bg-paper-200"
					testID="reservation-summary-toggle"
				>
					<View className="flex-1 flex-row items-center gap-2">
						<View className="h-[18px] w-[18px] items-center justify-center">
							<Chevron size={18} color={colors.ink.muted} />
						</View>
						<Text className="font-sans text-xs uppercase tracking-wider text-ink-muted">
							Reservations
						</Text>
					</View>
					<Text
						className="ml-3 font-sans-semibold text-base text-ink"
						style={{ fontVariant: ['tabular-nums'] }}
						testID="reservation-summary-total"
					>
						{formatAmount(summary.total, selectedEntity.currency)}
					</Text>
				</Pressable>

				{expanded &&
					(summary.rows.length > 0 ? (
						<View
							className="border-t border-paper-300"
							testID="reservation-summary-rows"
						>
							{summary.rows.map(({ entity, amount }, index) => {
								const Icon = getIcon(entity.icon || 'circle');
								const entityColors = getEntityColors(entity.type, entity.color);

								return (
									<View
										key={entity.id}
										className={`flex-row items-center px-4 py-3 ${
											index > 0 ? 'border-t border-paper-300' : ''
										}`}
										testID={`reservation-summary-row-${entity.id}`}
									>
										<View
											className="mr-3 h-8 w-8 items-center justify-center rounded-full"
											style={{ backgroundColor: entityColors.bgColor }}
										>
											<Icon size={16} color={entityColors.iconColor} />
										</View>
										<Text
											className="flex-1 font-sans text-base text-ink"
											numberOfLines={1}
										>
											{getEntityDisplayName(entity)}
										</Text>
										<Text
											className="ml-3 font-sans-semibold text-base text-ink"
											style={{ fontVariant: ['tabular-nums'] }}
										>
											{formatAmount(amount, selectedEntity.currency)}
										</Text>
									</View>
								);
							})}
						</View>
					) : (
						<View className="border-t border-paper-300 px-4 py-3">
							<Text
								className="font-sans text-sm text-ink-muted"
								testID="reservation-summary-empty"
							>
								{summary.emptyText}
							</Text>
						</View>
					))}
			</View>
		</View>
	);
}
