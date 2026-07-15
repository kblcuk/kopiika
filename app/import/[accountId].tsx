import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Text } from '@/src/components/text';
import { TestIDs } from '@/e2e/support/test-ids';
import { useStore } from '@/src/store';
import { detectColumns } from '@/src/utils/bank-import/detect-columns';
import type { ColumnMapping } from '@/src/utils/bank-import/types';

export default function ImportScreen() {
	const { accountId } = useLocalSearchParams<{ accountId: string }>();
	const router = useRouter();
	const entities = useStore((s) => s.entities);
	const account = useMemo(
		() => entities.find((e) => e.id === accountId),
		[entities, accountId]
	);

	const [, setRawText] = useState<string | null>(null);
	const [mapping, setMapping] = useState<ColumnMapping | null>(null);
	const [, setHeaders] = useState<string[]>([]);
	const [step, setStep] = useState<'pick' | 'map' | 'review'>('pick');
	const [busy, setBusy] = useState(false);

	const handlePick = useCallback(async () => {
		try {
			setBusy(true);
			const result = await DocumentPicker.getDocumentAsync({
				type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
				copyToCacheDirectory: true,
			});
			if (result.canceled || !result.assets?.[0]) return;
			const content = await new File(result.assets[0].uri).text();
			const detected = detectColumns(content);
			if (!detected) {
				Alert.alert('Import', 'No data rows found in that file.');
				return;
			}
			setRawText(content);
			setMapping(detected.mapping);
			setHeaders(detected.headers);
			setStep('map');
		} catch (e) {
			console.error('Import file pick failed', e);
			Alert.alert('Import', 'Could not read the selected file.');
		} finally {
			setBusy(false);
		}
	}, []);

	if (!account || account.type !== 'account') {
		return (
			<SafeAreaView className="flex-1 items-center justify-center bg-paper-50">
				<Text className="font-sans text-ink-muted">Account not found.</Text>
				<Pressable onPress={() => router.back()}>
					<Text className="mt-4 text-info">Close</Text>
				</Pressable>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView testID={TestIDs.importScreen} className="flex-1 bg-paper-50" edges={['top']}>
			<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
				<Pressable onPress={() => router.back()} hitSlop={20}>
					<Text className="font-sans text-base text-ink-muted">Cancel</Text>
				</Pressable>
				<Text className="font-sans-semibold text-base text-ink">Import · {account.name}</Text>
				<View style={{ width: 48 }} />
			</View>

			{step === 'pick' ? (
				<View className="flex-1 items-center justify-center px-8">
					<Text className="mb-6 text-center font-sans text-base text-ink-muted">
						Choose a CSV statement exported from your bank. We&apos;ll detect the date and
						amount columns.
					</Text>
					<Pressable
						testID={TestIDs.importPickFileButton}
						onPress={() => void handlePick()}
						className="rounded-full bg-ink px-6 py-3"
					>
						{busy ? (
							<ActivityIndicator color="white" />
						) : (
							<Text className="font-sans-semibold text-base text-paper-50">
								Choose file
							</Text>
						)}
					</Pressable>
				</View>
			) : null}

			{/* step === 'map' and 'review' wired in Tasks 8 & 9 */}
			{step === 'map' && mapping ? (
				<View className="flex-1 items-center justify-center">
					<Text className="text-ink-muted">Column mapping — Task 8</Text>
				</View>
			) : null}
		</SafeAreaView>
	);
}
