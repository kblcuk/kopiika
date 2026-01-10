import { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import * as Icons from 'lucide-react-native';

import { useStore } from '@/src/store';
import { getCurrentPeriod, getPeriodRange } from '@/src/types';
import type { EntityWithBalance, EntityType } from '@/src/types';
import { PeriodPicker } from '@/src/components/period-picker';
import { ProgressBar } from '@/src/components/progress-bar';
import { formatAmount, getProgressPercent, isOverspent } from '@/src/utils/format';
import { getBatchEntityActuals } from '@/src/db/transactions';

interface SummaryRowProps {
	entity: EntityWithBalance;
}

// Convert kebab-case to PascalCase for lucide icon lookup
function toIconName(name: string): string {
	return name
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

function SummaryRow({ entity }: SummaryRowProps) {
	const iconName = entity.icon ? toIconName(entity.icon) : 'Circle';
	const IconComponent =
		(Icons as unknown as Record<string, typeof Icons.Circle>)[iconName] || Icons.Circle;

	const overspent = isOverspent(entity.actual, entity.planned);
	const progress = getProgressPercent(entity.actual, entity.planned);

	return (
		<View className="border-b border-paper-200 px-5 py-4">
			<View className="flex-row items-center">
				{/* Icon */}
				<View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-paper-300">
					<IconComponent size={20} color="#6B5D4A" />
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
							<Text className="text-ink-faint font-sans text-sm">
								/ {formatAmount(entity.planned)}
							</Text>
						</View>
					</View>

					{/* Progress bar */}
					<ProgressBar progress={progress} isOverspent={overspent} />
				</View>
			</View>
		</View>
	);
}

interface SectionProps {
	title: string;
	entities: EntityWithBalance[];
}

function Section({ title, entities }: SectionProps) {
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
				<SummaryRow key={entity.id} entity={entity} />
			))}
		</View>
	);
}

export default function SummaryScreen() {
	const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
	const [actuals, setActuals] = useState<Map<string, number>>(new Map());

	const { entities, plans } = useStore(
		useShallow((state) => ({
			entities: state.entities,
			plans: state.plans,
		}))
	);

	// Fetch actuals when period changes
	useEffect(() => {
		async function fetchActuals() {
			const { start, end } = getPeriodRange(selectedPeriod);
			const entityIds = entities.map((e) => e.id);
			const results = await getBatchEntityActuals(entityIds, start, end);
			setActuals(results);
		}
		fetchActuals();
	}, [selectedPeriod, entities]);

	// Combine entities with their actuals and plans
	const entitiesWithBalance = useMemo(() => {
		return entities.map((entity) => {
			const plan = plans.find(
				(p) => p.entity_id === entity.id && p.period_start === selectedPeriod
			);
			const planned = plan?.planned_amount ?? 0;
			const actual = actuals.get(entity.id) ?? 0;

			return {
				...entity,
				planned,
				actual,
				remaining: planned - actual,
			} as EntityWithBalance;
		});
	}, [entities, plans, actuals, selectedPeriod]);

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

		// Sort by order within each group
		for (const type in groups) {
			groups[type as EntityType].sort((a, b) => a.order - b.order);
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
						<Section title="Categories" entities={groupedEntities.category} />
						<Section title="Savings" entities={groupedEntities.saving} />
					</>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}
