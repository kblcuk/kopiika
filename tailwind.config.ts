import type { Config } from 'tailwindcss';
import { colors } from './src/theme/colors';
import nativewindPreset from 'nativewind/preset';

export default {
	content: [
		'./app/**/*.{js,jsx,ts,tsx}',
		'./src/**/*.{js,jsx,ts,tsx}',
		'./components/**/*.{js,jsx,ts,tsx}',
	],
	presets: [nativewindPreset],
	theme: {
		extend: {
			colors,
			fontFamily: {
				sans: ['Lexend_400Regular', 'System'],
				'sans-medium': ['Lexend_500Medium', 'System'],
				'sans-semibold': ['Lexend_600SemiBold', 'System'],
				'sans-bold': ['Lexend_700Bold', 'System'],
			},
		},
	},
	plugins: [],
} satisfies Config;
