/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		'./app/**/*.{js,jsx,ts,tsx}',
		'./src/**/*.{js,jsx,ts,tsx}',
		'./components/**/*.{js,jsx,ts,tsx}',
	],
	presets: [require('nativewind/preset')],
	theme: {
		extend: {
			colors: {
				// Ledger paper theme - warm cream with ink-like typography
				paper: {
					50: '#FDFCFA',
					100: '#FAF8F5',
					200: '#F5F1EB',
					300: '#EBE5DB',
					400: '#DDD4C4',
					500: '#C9BDAA',
				},
				ink: {
					DEFAULT: '#2C2416',
					light: '#4A3F2E',
					muted: '#6B5D4A',
					faint: '#9C8B74',
				},
				accent: {
					DEFAULT: '#B85C38', // Terracotta/rust - for positive/income
					dark: '#8B4429',
					light: '#D4896A',
				},
				negative: {
					DEFAULT: '#9B2C2C', // Deep red for overspending
					light: '#C53030',
				},
				positive: {
					DEFAULT: '#2D5A3D', // Forest green for savings/positive
					light: '#3D7A52',
				},
			},
			fontFamily: {
				sans: ['SpaceGrotesk_400Regular', 'System'],
				'sans-medium': ['SpaceGrotesk_500Medium', 'System'],
				'sans-semibold': ['SpaceGrotesk_600SemiBold', 'System'],
				'sans-bold': ['SpaceGrotesk_700Bold', 'System'],
			},
		},
	},
	plugins: [],
};
