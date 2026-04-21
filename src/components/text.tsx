import { forwardRef } from 'react';
import { Text as RNText, Platform, type TextProps } from 'react-native';
import { cssInterop } from 'nativewind';

/**
 * Drop-in replacement for React Native's Text.
 *
 * On Android, custom fonts (Lexend in our case) render with
 * `includeFontPadding: true` by default, which adds extra space
 * derived from the font's ascent/descent metrics. With Lexend this
 * causes visible clipping of descenders in tight layouts.
 *
 * Setting `includeFontPadding: false` globally via `Text.defaultProps`
 * doesn't work because NativeWind replaces the `style` prop entirely.
 * This wrapper prepends the fix so it's always present but still
 * overridable by the caller's styles.
 */
const AppText = forwardRef<RNText, TextProps>((props, ref) => (
	<RNText
		{...props}
		ref={ref}
		style={
			Platform.OS === 'android' ? [{ includeFontPadding: false }, props.style] : props.style
		}
	/>
));
AppText.displayName = 'Text';

cssInterop(AppText, { className: 'style' });

export { AppText as Text };
