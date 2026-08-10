import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, X } from 'lucide-react-native';

import { Text } from '@/src/components/text';
import { InfoPin } from '@/src/components/info-pin';
import { EntityCreateModal, type EntityDraft } from '@/src/components/entity-create-modal';
import {
	PRESET_CHIPS,
	createEntitiesFromPresets,
	createPlansForEntities,
	presetKey,
	type PresetChip,
} from '@/src/onboarding/presets';
import { useStore } from '@/src/store';
import { setHasCompletedOnboarding, setDefaultCurrency } from '@/src/utils/app-prefs';
import { getCurrentPeriod, type Entity, type EntityType, type Plan } from '@/src/types';
import { generateId } from '@/src/utils/ids';
import { getCurrencySymbol } from '@/src/utils/format';
import { CurrencyPickerSheet } from '@/src/components/currency-picker-sheet';
import { getEntityColors } from '@/src/utils/entity-colors';
import { getIcon } from '@/src/constants/icon-registry';
import { colors } from '@/src/theme/colors';
import { TestIDs } from '@/e2e/support/test-ids';

const SECTIONS: { type: EntityType; label: string; optional?: boolean }[] = [
	{ type: 'income', label: 'Income' },
	{ type: 'account', label: 'Accounts' },
	{ type: 'category', label: 'Categories' },
	{ type: 'saving', label: 'Savings goals', optional: true },
];

interface StagedCustom extends EntityDraft {
	id: string;
}

export default function SetupScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<{ fromSettings?: string }>();
	const fromSettings = params.fromSettings === 'true';

	const addEntity = useStore((s) => s.addEntity);
	const setPlan = useStore((s) => s.setPlan);
	const appCurrency = useStore((s) => s.appCurrency);

	const [picked, setPicked] = useState<Set<string>>(
		new Set(PRESET_CHIPS.filter((c) => c.defaultSelected).map(presetKey))
	);
	const [customs, setCustoms] = useState<StagedCustom[]>([]);
	const [customModalType, setCustomModalType] = useState<EntityType | null>(null);
	const [currency, setCurrency] = useState(appCurrency);
	const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

	const togglePick = (chip: PresetChip) => {
		if (fromSettings) return;
		const key = presetKey(chip);
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	// Persist the pick immediately for two reasons: EntityCreateModal (staged
	// customs) reads `appCurrency` from the store, not from this screen's local
	// state, so a staged custom would be built in the stale currency otherwise;
	// and writing the pref means a skip still keeps the choice. There is
	// nothing to relabel yet — no entity exists until Continue, which is also
	// why setting the store value directly is safe here: no row can disagree
	// with it.
	const handleCurrencySelect = (code: string) => {
		setCurrency(code);
		useStore.setState({ appCurrency: code });
		void setDefaultCurrency(code);
	};

	const handleCustomCreate = (draft: EntityDraft) => {
		setCustoms((prev) => [...prev, { ...draft, id: generateId() }]);
	};

	const removeCustom = (id: string) => {
		setCustoms((prev) => prev.filter((c) => c.id !== id));
	};

	const chipsByType = useMemo(() => {
		const map = new Map<EntityType, PresetChip[]>();
		for (const chip of PRESET_CHIPS) {
			if (!map.has(chip.type)) map.set(chip.type, []);
			map.get(chip.type)!.push(chip);
		}
		return map;
	}, []);

	const handleContinue = async () => {
		try {
			if (fromSettings) {
				router.replace('/(tabs)/settings');
				return;
			}
			const selected = PRESET_CHIPS.filter((c) => picked.has(presetKey(c)));
			const presetEntities = createEntitiesFromPresets(selected, currency);
			const entityToPreset = new Map(
				presetEntities.map((e) => [
					e.id,
					selected.find((c) => c.name === e.name && c.type === e.type)!,
				])
			);
			const presetPlans = createPlansForEntities(presetEntities, entityToPreset, currency);

			// Customs: lay out after presets of the same type, respecting maxRows.
			const customEntities: Entity[] = [];
			const customPlans: Plan[] = [];
			const period = getCurrentPeriod();
			for (const custom of customs) {
				const maxRows = custom.type === 'category' ? 3 : 1;
				const sameType = [
					...presetEntities.filter((e) => e.type === custom.type),
					...customEntities.filter((e) => e.type === custom.type),
				];
				const rowCounts = Array.from(
					{ length: maxRows },
					(_, i) => sameType.filter((e) => e.row === i).length
				);
				let targetRow = 0;
				for (let i = 1; i < maxRows; i++) {
					if (rowCounts[i]! < rowCounts[targetRow]!) targetRow = i;
				}
				const position = rowCounts[targetRow]!;
				const entityId = generateId();
				customEntities.push({
					id: entityId,
					type: custom.type,
					name: custom.name,
					currency,
					icon: custom.icon,
					color: custom.color,
					row: targetRow,
					position,
					is_investment: custom.type === 'account' ? custom.isInvestment : undefined,
				});
				if (custom.type !== 'account' && custom.plannedAmountMinor != null) {
					customPlans.push({
						id: generateId(),
						entity_id: entityId,
						period: 'all-time',
						period_start: period,
						planned_amount_minor: custom.plannedAmountMinor,
					});
				}
			}

			for (const entity of [...presetEntities, ...customEntities]) await addEntity(entity);
			for (const plan of [...presetPlans, ...customPlans]) await setPlan(plan);

			// The entities above were already written in the chosen currency, but
			// the balance-adjustment system entity was NOT: migration
			// 0001_add-balance-adjustment.sql seeds it with a hardcoded 'EUR'.
			// It sorts first in getAllEntities (type 'account', position -1), and
			// while resolveAppCurrency excludes it, leaving one EUR row on a GBP
			// board is a latent inconsistency. set_all has no WHERE clause, so
			// this fixes it — and on a board this small it costs nothing.
			await useStore.getState().setAppCurrency(currency);

			await setHasCompletedOnboarding(true);
			router.replace('/(tabs)');
		} catch (error) {
			console.error('Failed to complete setup:', error);
			Alert.alert('Setup failed', 'Could not save your selections. Please try again.');
		}
	};

	const handleSkip = async () => {
		try {
			if (fromSettings) {
				router.replace('/(tabs)/settings');
				return;
			}
			await setHasCompletedOnboarding(true);
			router.replace('/(tabs)');
		} catch (error) {
			console.error('Failed to skip setup:', error);
			Alert.alert('Could not continue', 'Please try again.');
		}
	};

	return (
		<SafeAreaView
			testID={TestIDs.onboarding.setupScreen}
			className="flex-1 bg-paper-50"
			edges={['top', 'bottom']}
		>
			<ScrollView contentContainerStyle={{ paddingBottom: 24 }} className="flex-1 px-6 pt-6">
				<Text className="font-sans-bold text-2xl text-ink">Your money map</Text>
				<Text className="mt-1 font-sans text-base text-ink-muted">
					Pick what fits. You can change anything later.
				</Text>

				<Pressable
					testID={TestIDs.onboarding.setupCurrencyRow}
					onPress={() => setCurrencyPickerOpen(true)}
					disabled={fromSettings}
					className="mt-6 flex-row items-center justify-between rounded-lg bg-paper-100 px-4 py-3.5 active:bg-paper-200"
				>
					<Text className="font-sans text-base text-ink">Currency</Text>
					<View className="flex-row items-center">
						<Text className="font-sans text-base text-ink-muted">
							{getCurrencySymbol(currency)} {currency}
						</Text>
						<ChevronRight size={16} color={colors.ink.muted} />
					</View>
				</Pressable>

				{fromSettings && (
					<View className="mt-4 rounded-2xl bg-paper-200 px-4 py-3">
						<Text className="font-sans text-sm text-ink-muted">
							This is what new users see — your entities are already set up.
						</Text>
					</View>
				)}

				{SECTIONS.map(({ type, label, optional }) => {
					const chips = chipsByType.get(type) ?? [];
					const sectionCustoms = customs.filter((c) => c.type === type);
					return (
						<View key={type} className="mt-8">
							<View className="flex-row items-center">
								<Text className="font-sans-semibold text-xs uppercase text-ink-muted">
									{label}
									{optional ? ' (optional)' : ''}
								</Text>
								<InfoPin articleId="entity-types" size={12} />
							</View>
							<View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
								{chips.map((chip) => {
									const key = presetKey(chip);
									const selected = picked.has(key);
									return (
										<Pressable
											key={key}
											testID={TestIDs.onboarding.setupChip(key)}
											accessibilityState={{
												selected,
												disabled: fromSettings,
											}}
											onPress={() => togglePick(chip)}
											className={`rounded-full px-3 py-2 ${
												selected
													? 'bg-ink'
													: 'border border-paper-300 bg-paper-50'
											}`}
										>
											<Text
												className={`font-sans text-sm ${
													selected ? 'text-paper-50' : 'text-ink'
												}`}
											>
												{selected ? '✓ ' : ''}
												{chip.name}
											</Text>
										</Pressable>
									);
								})}
								{sectionCustoms.map((custom) => (
									<CustomChip
										key={custom.id}
										custom={custom}
										onRemove={() => removeCustom(custom.id)}
									/>
								))}
								{!fromSettings && (
									<Pressable
										testID={TestIDs.onboarding.setupCustomChip(type)}
										onPress={() => setCustomModalType(type)}
										className="rounded-full border border-paper-300 px-3 py-2"
									>
										<Text className="font-sans text-sm text-ink-muted">
											+ Custom
										</Text>
									</Pressable>
								)}
							</View>
						</View>
					);
				})}
			</ScrollView>

			<View className="border-t border-paper-300 px-6 py-4">
				<Pressable
					testID={TestIDs.onboarding.setupContinueButton}
					onPress={() => {
						void handleContinue();
					}}
					className="h-12 items-center justify-center rounded-2xl bg-ink"
				>
					<Text className="font-sans-semibold text-base text-paper-50">
						{fromSettings ? 'Done' : 'Continue'}
					</Text>
				</Pressable>
				{!fromSettings && (
					<Pressable
						testID={TestIDs.onboarding.setupSkipLink}
						onPress={() => {
							void handleSkip();
						}}
						className="mt-3 items-center"
					>
						<Text className="font-sans text-sm text-ink-muted">
							Continue without these suggestions
						</Text>
					</Pressable>
				)}
			</View>

			<EntityCreateModal
				visible={customModalType !== null}
				entityType={customModalType}
				onClose={() => setCustomModalType(null)}
				onCreate={handleCustomCreate}
			/>

			<CurrencyPickerSheet
				visible={currencyPickerOpen}
				selectedCode={currency}
				onSelect={handleCurrencySelect}
				onClose={() => setCurrencyPickerOpen(false)}
			/>
		</SafeAreaView>
	);
}

function CustomChip({ custom, onRemove }: { custom: StagedCustom; onRemove: () => void }) {
	const palette = getEntityColors(custom.type, custom.color);
	const Icon = getIcon(custom.icon);
	return (
		<Pressable
			testID={TestIDs.onboarding.setupStagedCustom(custom.id)}
			onPress={onRemove}
			accessibilityState={{ selected: true }}
			className="flex-row items-center rounded-full px-3 py-2"
			style={{ backgroundColor: palette.bgColor }}
		>
			<Icon size={14} color={palette.iconColor} />
			<Text className="ml-1.5 font-sans text-sm" style={{ color: palette.iconColor }}>
				{custom.name}
			</Text>
			<X size={12} color={palette.iconColor} style={{ marginLeft: 6, opacity: 0.7 }} />
		</Pressable>
	);
}
