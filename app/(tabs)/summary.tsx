import { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useRouter } from 'expo-router';

import { useStore } from '@/src/store';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import type { EntityWithBalance, EntityType } from '@/src/types';
import { PeriodPicker } from '@/src/components/period-picker';
import { ProgressBar } from '@/src/components/progress-bar';
import { formatAmount, getProgressPercent, isOverspent } from '@/src/utils/format';
import { getBatchEntityActuals } from '@/src/db/transactions';
import { getIcon } from '@/src/constants/icon-registry';
import { getEntityTypeColors } from '@/src/utils/entity-colors';

interface SummaryRowProps {
	entity: EntityWithBalance;
	onPress: () => void;
}

function SummaryRow({ entity, onPress }: SummaryRowProps) {
	const IconComponent = getIcon(entity.icon || 'circle');

	const overspent = isOverspent(entity.actual, entity.planned);
	const progress = getProgressPercent(entity.actual, entity.planned);
	const typeColors = getEntityTypeColors(entity.type);

	return (
		<Pressable onPress={onPress} className="border-b border-paper-200 px-5 py-4">
			<View className="flex-row items-center">
				{/* Icon */}
				<View
					className={`mr-3 h-12 w-12 items-center justify-center rounded-full ${typeColors.bg}`}
				>
					<IconComponent size={20} color={typeColors.iconColor} />
				</View>

				{/* Content */}
				<View className="flex-1">
					{/* Name and amounts row */}
					<View className="mb-2 flex-row items-baseline justify-between">
						<Text className="font-sans-semibold text-base text-ink">{entity.name}</Text>
						<View className="flex-row items-baseline gap-2">
							<Text
								className={`font-sans-semibold text-base ${
									overspent ? 'text-negative' : 'text-ink'
								}`}
							>
								{formatAmount(entity.actual)}
							</Text>
							<Text className="font-sans text-sm text-ink-muted">
								/ {formatAmount(entity.planned)}
							</Text>
						</View>
					</View>

					{/* Progress bar */}
					<ProgressBar
						progress={progress}
						inverse={entity.type === 'saving'}
						planned={entity.planned}
					/>
				</View>
			</View>
		</Pressable>
	);
}

interface SectionProps {
	title: string;
	entities: EntityWithBalance[];
	onEntityPress: (entity: EntityWithBalance) => void;
}

function Section({ title, entities, onEntityPress }: SectionProps) {
	if (entities.length === 0) return null;

	return (
		<View>
			{/* Section header */}
			<View className="bg-paper-100 px-5 py-2">
				<Text className="font-sans text-xs uppercase tracking-wider text-ink-muted">
					{title}
				</Text>
			</View>

			{/* Section items */}
			{entities.map((entity) => (
				<SummaryRow key={entity.id} entity={entity} onPress={() => onEntityPress(entity)} />
			))}
		</View>
	);
}

export default function SummaryScreen() {
	const router = useRouter();
	const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
	const [actuals, setActuals] = useState<Map<string, number>>(new Map());

	const { entities, plans, transactions } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
			transactions: state.transactions,
		}))
	);

	const handleEntityPress = (entity: EntityWithBalance) => {
		router.push(`/history?period=${selectedPeriod}&entityId=${entity.id}`);
	};

	// Fetch actuals when period changes
	useEffect(() => {
		async function fetchActuals() {
			const { start, end } = getPeriodRange(selectedPeriod);
			const entityIds = entities.map((e) => e.id);
			const results = await getBatchEntityActuals(entityIds, start, end);
			setActuals(results);
		}
		fetchActuals();
	}, [selectedPeriod, entities, transactions]);

	// Combine entities with their actuals and plans
	const entitiesWithBalance = useMemo(() => {
		return entities.map((entity) => {
			// All plans use 'all-time' period - same planned amount for all months
			const plan = plans.find((p) => p.entity_id === entity.id && p.period === 'all-time');
			const planned = plan?.planned_amount ?? 0;
			const actual = actuals.get(entity.id) ?? 0;

			return {
				...entity,
				planned,
				actual,
				remaining: planned - actual,
			} as EntityWithBalance;
		});
	}, [entities, plans, actuals]);

	// Group entities by type
	const groupedEntities = useMemo(() => {
		const groups: Record<EntityType, EntityWithBalance[]> = {
			income: [],
			account: [],
			category: [],
			saving: [],
		};

		for (const entity of entitiesWithBalance) {
			groups[entity.type].push(entity);
		}

		// Sort by row then position within each group
		for (const type in groups) {
			groups[type as EntityType].sort(
				(a, b) => b.actual - a.actual || a.row - b.row || a.position - b.position
			);
		}

		return groups;
	}, [entitiesWithBalance]);

	return (
		<SafeAreaView className="flex-1 bg-paper-50" edges={['top']}>
			{/* Header */}
			<View className="border-b border-paper-300 px-5 py-4">
				<Text className="font-sans-bold text-2xl text-ink">Summary</Text>
			</View>

			{/* Period picker */}
			<PeriodPicker period={selectedPeriod} onChange={setSelectedPeriod} />

			{/* Content */}
			<ScrollView className="flex-1">
				{entitiesWithBalance.length === 0 ? (
					<View className="flex-1 items-center justify-center px-5 py-16">
						<Text className="font-sans text-base text-ink-muted">
							No data this period
						</Text>
					</View>
				) : (
					<>
						<Section
							title="Categories"
							entities={groupedEntities.category}
							onEntityPress={handleEntityPress}
						/>
						<Section
							title="Savings"
							entities={groupedEntities.saving}
							onEntityPress={handleEntityPress}
						/>
					</>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}
