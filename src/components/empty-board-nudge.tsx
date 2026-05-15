import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';

import { Text } from './text';
import { colors } from '@/src/theme/colors';
import {
	getEmptyBoardNudgeDismissed,
	setEmptyBoardNudgeDismissed,
} from '@/src/utils/app-prefs';
import { TestIDs } from '@/e2e/support/test-ids';

interface EmptyBoardNudgeProps {
	entityCount: number;
	transactionCount: number;
	onAddEntity: () => void;
}

export function EmptyBoardNudge({
	entityCount,
	transactionCount,
	onAddEntity,
}: EmptyBoardNudgeProps) {
	const [hidden, setHidden] = useState(false);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		void (async () => {
			setHidden(await getEmptyBoardNudgeDismissed());
			setLoaded(true);
		})();
	}, []);

	if (!loaded) return null;
	if (hidden) return null;
	if (transactionCount > 0) return null;

	const dismiss = async () => {
		setHidden(true);
		await setEmptyBoardNudgeDismissed(true);
	};

	if (entityCount === 0) {
		return (
			<View
				testID={TestIDs.emptyBoardNudge.card}
				className="mx-5 my-3 rounded-2xl bg-paper-100 px-4 py-3"
			>
				<View className="flex-row items-start justify-between">
					<Text className="flex-1 pr-2 font-sans text-base text-ink">
						Start by adding your first account or category — tap the + below.
					</Text>
					<Pressable
						testID={TestIDs.emptyBoardNudge.dismiss}
						onPress={dismiss}
						hitSlop={12}
					>
						<X size={14} color={colors.ink.muted} />
					</Pressable>
				</View>
				<Pressable
					testID={TestIDs.emptyBoardNudge.addEntityCta}
					onPress={onAddEntity}
					className="mt-3 self-start rounded-2xl bg-ink px-4 py-2"
				>
					<Text className="font-sans-semibold text-sm text-paper-50">
						Add my first entity
					</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View
			testID={TestIDs.emptyBoardNudge.card}
			className="mx-5 my-3 rounded-2xl bg-paper-100 px-4 py-3"
		>
			<View className="flex-row items-start justify-between">
				<Text className="flex-1 pr-2 font-sans text-base text-ink">
					Drag an income onto an account to record getting paid. Or use ✚ for any
					transaction.
				</Text>
				<Pressable
					testID={TestIDs.emptyBoardNudge.dismiss}
					onPress={dismiss}
					hitSlop={12}
				>
					<X size={14} color={colors.ink.muted} />
				</Pressable>
			</View>
		</View>
	);
}
