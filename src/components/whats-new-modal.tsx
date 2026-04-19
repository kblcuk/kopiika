import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getLatestChangelog, type ChangelogSection } from '@/src/utils/changelog';
import { SheetHeader } from './sheet-header';

interface WhatsNewModalProps {
	visible: boolean;
	onClose: () => void;
}

const sectionEmoji: Record<string, string> = {
	Features: 'New',
	'Bug Fixes': 'Fixed',
};

function SectionBlock({ section }: { section: ChangelogSection }) {
	const label = sectionEmoji[section.type] ?? section.type;

	return (
		<View className="mb-5">
			<Text
				className="mb-2 font-sans-semibold text-xs uppercase text-ink-muted"
				style={{ letterSpacing: 1.12 }}
			>
				{label}
			</Text>
			{section.items.map((item, i) => (
				<View key={i} className="mb-1.5 flex-row">
					<Text className="mr-2 font-sans text-base text-ink-muted">{'\u2022'}</Text>
					<Text
						className="flex-1 font-sans text-base text-ink"
						style={{ letterSpacing: 0.24 }}
					>
						{item}
					</Text>
				</View>
			))}
		</View>
	);
}

export function WhatsNewModal({ visible, onClose }: WhatsNewModalProps) {
	const insets = useSafeAreaInsets();
	const changelog = getLatestChangelog();

	if (!changelog) return null;

	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<Pressable
				testID="whats-new-backdrop"
				className="flex-1 bg-black/25"
				onPress={onClose}
			/>

			<View
				className="rounded-t-3xl border-t border-paper-300 bg-paper-50 px-6 pb-4 pt-2"
				style={{ paddingBottom: Math.max(insets.bottom, 16) }}
			>
				<SheetHeader onClose={onClose} />
				{/* Header */}
				<Text className="mb-1 font-sans-bold text-xl text-ink">What&apos;s New</Text>
				<Text className="mb-5 font-sans text-sm text-ink-muted">
					Version {changelog.version}
				</Text>

				{/* Changelog sections */}
				<ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
					{changelog.sections.map((section, i) => (
						<SectionBlock key={i} section={section} />
					))}
				</ScrollView>

				{/* Dismiss */}
				<Pressable
					testID="whats-new-dismiss"
					onPress={onClose}
					className="mt-2 h-12 items-center justify-center rounded-2xl bg-ink"
				>
					<Text className="font-sans-semibold text-base text-paper-50">Got it</Text>
				</Pressable>
			</View>
		</Modal>
	);
}
