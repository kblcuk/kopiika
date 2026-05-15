import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '@/src/components/text';
import { InfoPin } from '@/src/components/info-pin';
import { EntityCreateModal } from '@/src/components/entity-create-modal';
import {
	PRESET_CHIPS,
	createEntitiesFromPresets,
	createPlansForEntities,
	presetKey,
	type PresetChip,
} from '@/src/onboarding/presets';
import { useStore } from '@/src/store';
import { setHasCompletedOnboarding } from '@/src/utils/app-prefs';
import type { EntityType } from '@/src/types';
import { TestIDs } from '@/e2e/support/test-ids';

const SECTIONS: { type: EntityType; label: string; optional?: boolean }[] = [
	{ type: 'income', label: 'Income' },
	{ type: 'account', label: 'Accounts' },
	{ type: 'category', label: 'Categories' },
	{ type: 'saving', label: 'Savings goals', optional: true },
];

export default function SetupScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<{ fromSettings?: string }>();
	const fromSettings = params.fromSettings === 'true';

	const addEntity = useStore((s) => s.addEntity);
	const setPlan = useStore((s) => s.setPlan);

	const [picked, setPicked] = useState<Set<string>>(
		new Set(PRESET_CHIPS.filter((c) => c.defaultSelected).map(presetKey))
	);
	const [customModalType, setCustomModalType] = useState<EntityType | null>(null);

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

	const chipsByType = useMemo(() => {
		const map = new Map<EntityType, PresetChip[]>();
		for (const chip of PRESET_CHIPS) {
			if (!map.has(chip.type)) map.set(chip.type, []);
			map.get(chip.type)!.push(chip);
		}
		return map;
	}, []);

	const handleContinue = async () => {
		if (fromSettings) {
			router.replace('/(tabs)/settings');
			return;
		}
		const selected = PRESET_CHIPS.filter((c) => picked.has(presetKey(c)));
		const entities = createEntitiesFromPresets(selected);
		const entityToPreset = new Map(
			entities.map((e) => [
				e.id,
				selected.find((c) => c.name === e.name && c.type === e.type)!,
			])
		);
		const plans = createPlansForEntities(entities, entityToPreset);
		for (const entity of entities) await addEntity(entity);
		for (const plan of plans) await setPlan(plan);
		await setHasCompletedOnboarding(true);
		router.replace('/(tabs)');
	};

	const handleSkip = async () => {
		if (fromSettings) {
			router.replace('/(tabs)/settings');
			return;
		}
		await setHasCompletedOnboarding(true);
		router.replace('/(tabs)');
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

				{fromSettings && (
					<View className="mt-4 rounded-2xl bg-paper-200 px-4 py-3">
						<Text className="font-sans text-sm text-ink-muted">
							This is what new users see — your entities are already set up.
						</Text>
					</View>
				)}

				{SECTIONS.map(({ type, label, optional }) => {
					const chips = chipsByType.get(type) ?? [];
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
					onPress={handleContinue}
					className="h-12 items-center justify-center rounded-2xl bg-ink"
				>
					<Text className="font-sans-semibold text-base text-paper-50">
						{fromSettings ? 'Done' : 'Continue'}
					</Text>
				</Pressable>
				{!fromSettings && (
					<Pressable
						testID={TestIDs.onboarding.setupSkipLink}
						onPress={handleSkip}
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
			/>
		</SafeAreaView>
	);
}
