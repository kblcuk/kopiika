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

/** Returns the N months before `currentPeriod`, oldest first (e.g. ['2025-11','2025-12','2026-01']). */
function getPriorPeriods(currentPeriod: string, count: number): string[] {
	const [year, month] = currentPeriod.split('-').map(Number);
	return Array.from({ length: count }, (_, i) => {
		const offset = count - i; // count-1 months ago … 1 month ago
		const d = new Date(year, month - 1 - offset, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	});
}

/**
 * 4-bar sparkline showing monthly actuals oldest→newest (left→right).
 * Only rendered for entities where monthly trends are meaningful (income / category).
 */
function MiniSparkline({ values, planned }: { values: number[]; planned: number }) {
	if (values.every((v) => v === 0)) return null;

	const max = Math.max(...values, planned > 0 ? planned : 1);

	return (
		<View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 20, gap: 2 }}>
			{values.map((val, i) => {
				const isCurrent = i === values.length - 1;
				const isOver = planned > 0 && val > planned;
				const heightPx = Math.max(2, Math.round((val / max) * 18));
				const color = isOver ? '#C23030' : planned > 0 ? '#2F7D4A' : '#9C8B74';
				const opacity = isCurrent ? 1 : 0.25 + (i / (values.length - 1)) * 0.45;
				return (
					<View
						key={i}
						style={{
							width: 5,
							height: heightPx,
							borderRadius: 2,
							backgroundColor: color,
							opacity,
						}}
					/>
				);
			})}
		</View>
	);
}

interface SummaryRowProps {
	entity: EntityWithBalance;
	/** 4-element array of monthly actuals oldest→newest. Sparkline shown for income/category. */
	trendValues?: number[];
	onPress: () => void;
}

function SummaryRow({ entity, trendValues, onPress }: SummaryRowProps) {
	const IconComponent = getIcon(entity.icon || 'circle');

	const overspent = isOverspent(entity.actual, entity.planned);
	const progress = getProgressPercent(entity.actual, entity.planned);
	const typeColors = getEntityTypeColors(entity.type);
	const showSparkline =
		trendValues !== undefined && (entity.type === 'income' || entity.type === 'category');

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

					{/* Progress bar + optional sparkline */}
					<View className="flex-row items-center gap-3">
						<View className="flex-1">
							<ProgressBar
								progress={progress}
								inverse={entity.type === 'saving'}
								planned={entity.planned}
							/>
						</View>
						{showSparkline && (
							<MiniSparkline values={trendValues!} planned={entity.planned} />
						)}
					</View>
				</View>
			</View>
		</Pressable>
	);
}

interface SectionProps {
	title: string;
	entities: EntityWithBalance[];
	/** Monthly trend maps, oldest first, used for sparklines */
	trendActuals?: Map<string, number>[];
	onEntityPress: (entity: EntityWithBalance) => void;
}

function Section({ title, entities, trendActuals, onEntityPress }: SectionProps) {
	if (entities.length === 0) return null;

	const totalActual = entities.reduce((s, e) => s + e.actual, 0);
	const totalPlanned = entities.reduce((s, e) => s + e.planned, 0);

	return (
		<View>
			{/* Section header with totals */}
			<View className="flex-row items-center justify-between bg-paper-100 px-5 py-2">
				<Text className="font-sans text-xs uppercase tracking-wider text-ink-muted">
					{title}
				</Text>
				{totalPlanned > 0 && (
					<Text className="font-sans text-xs text-ink-muted">
						<Text
							className={
								totalActual > totalPlanned ? 'text-negative' : 'text-ink-light'
							}
						>
							{formatAmount(totalActual)}
						</Text>
						{' / '}
						{formatAmount(totalPlanned)}
					</Text>
				)}
			</View>

			{/* Section items */}
			{entities.map((entity) => {
				const trendValues = trendActuals?.map((m) => m.get(entity.id) ?? 0);
				return (
					<SummaryRow
						key={entity.id}
						entity={entity}
						trendValues={trendValues}
						onPress={() => onEntityPress(entity)}
					/>
				);
			})}
		</View>
	);
}

export default function SummaryScreen() {
	const router = useRouter();
	const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriod());
	const [actuals, setActuals] = useState<Map<string, number>>(new Map());
	// 4 monthly actuals maps oldest→newest (3 prior months + selected period)
	const [trendActuals, setTrendActuals] = useState<Map<string, number>[]>([]);

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

	// Fetch current-period actuals + 3-month trend in parallel
	useEffect(() => {
		async function fetchActuals() {
			const entityIds = entities.map((e) => e.id);
			const priorPeriods = getPriorPeriods(selectedPeriod, 3);
			const allPeriods = [...priorPeriods, selectedPeriod]; // oldest → current

			const [currentResult, ...trendResults] = await Promise.all(
				allPeriods.map((p) => {
					const { start, end } = getPeriodRange(p);
					return getBatchEntityActuals(entityIds, start, end);
				})
			);

			setActuals(currentResult);
			setTrendActuals([...trendResults, currentResult]); // oldest first
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
							trendActuals={trendActuals}
							onEntityPress={handleEntityPress}
						/>
						<Section
							title="Savings"
							entities={groupedEntities.saving}
							trendActuals={trendActuals}
							onEntityPress={handleEntityPress}
						/>
					</>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}
