import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/src/theme/colors';

/**
 * App-wide launch/loading screen shown by the cold-start gate while fonts and
 * the database hydrate. Paper background + accent spinner so the gate never
 * flashes a bare/unstyled frame.
 *
 * Deliberately minimal and dependency-light: a plain `View` (not `SafeAreaView`
 * — this renders above the navigation tree, before any SafeAreaProvider) and no
 * custom-font text, since it can appear before the Lexend fonts finish loading.
 */
export function LoadingScreen() {
	return (
		<View testID="loading-screen" className="flex-1 items-center justify-center bg-paper-100">
			<ActivityIndicator size="large" color={colors.accent.DEFAULT} />
		</View>
	);
}
