import type { ComponentProps } from 'react';
import Animated from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

/** Board scroll view; its PortalProvider renders dragged bubbles above all other content. */
export function BoardScrollSurface({
	children,
	...props
}: ComponentProps<typeof Animated.ScrollView>) {
	return (
		<Sortable.PortalProvider>
			<Animated.ScrollView
				className="flex-1 overflow-visible"
				contentContainerClassName="overflow-visible"
				contentContainerStyle={{ paddingVertical: 12 }}
				scrollEventThrottle={16}
				{...props}
			>
				{children}
			</Animated.ScrollView>
		</Sortable.PortalProvider>
	);
}
