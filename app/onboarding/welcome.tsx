import { Alert, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '@/src/components/text';
import { setHasCompletedOnboarding } from '@/src/utils/app-prefs';
import { TestIDs } from '@/e2e/support/test-ids';

export default function WelcomeScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<{ fromSettings?: string }>();
	const fromSettings = params.fromSettings === 'true';

	const handleContinue = () => {
		if (fromSettings) {
			router.push({ pathname: '/onboarding/setup', params: { fromSettings: 'true' } });
		} else {
			router.push('/onboarding/setup');
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
			console.error('Failed to skip onboarding:', error);
			Alert.alert('Could not continue', 'Please try again.');
		}
	};

	return (
		<SafeAreaView
			testID={TestIDs.onboarding.welcomeScreen}
			className="flex-1 bg-paper-50"
			edges={['top', 'bottom']}
		>
			<View className="flex-1 justify-center px-6">
				<Text className="font-sans-bold text-3xl text-ink">Kopiika</Text>
				<Text className="mt-2 font-sans text-base text-ink-muted">
					Personal finance, the way you actually think about it.
				</Text>

				<View className="mt-10" style={{ gap: 16 }}>
					<Text className="font-sans text-base text-ink">
						You handle the money in real life.
					</Text>
					<Text className="font-sans text-base text-ink">
						You record what happened in the app.
					</Text>
					<Text className="font-sans text-base text-ink">
						You see plan vs reality at a glance.
					</Text>
				</View>

				<Text className="mt-10 font-sans text-sm text-ink-muted">
					No accounts, no sync, no judgement. Your data stays on your device.
				</Text>
			</View>

			<View className="px-6 pb-6">
				<Pressable
					testID={TestIDs.onboarding.welcomeContinueButton}
					onPress={handleContinue}
					className="h-12 items-center justify-center rounded-2xl bg-ink"
				>
					<Text className="font-sans-semibold text-base text-paper-50">
						Set up my money map
					</Text>
				</Pressable>
				<Pressable
					testID={TestIDs.onboarding.welcomeSkipLink}
					onPress={() => {
						void handleSkip();
					}}
					className="mt-4 items-center"
				>
					<Text className="font-sans text-sm text-ink-muted">
						{fromSettings
							? 'Done — back to settings'
							: "Skip — I'll set things up myself"}
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}
