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
				// Adjusted for higher contrast and dyslexia accessibility
				paper: {
					DEFAULT: '#F8F4ED',
					50: '#FFFEFA', // Reserved for highlights
					100: '#F8F4ED', // Main background
					200: '#EBE3D5', // Subtle borders/dividers
					300: '#D4C8B3', // Disabled states
				},
				ink: {
					DEFAULT: '#1A1410', // Darker for better contrast
					light: '#3D3426', // Secondary text
					muted: '#6B5D4A', // Tertiary text
				},
				accent: {
					DEFAULT: '#D4652F', // Brighter terracotta for better visibility
					dark: '#9B4621',
					light: '#E8926A',
				},
				negative: {
					DEFAULT: '#C23030', // Brighter red for overspending
					light: '#E85555',
				},
				positive: {
					DEFAULT: '#2F7D4A', // Brighter green for categories/positive
					light: '#4A9D65',
				},
				info: {
					DEFAULT: '#2B5F8A', // Muted blue for savings goals
					light: '#4A80AB',
				},
				warning: {
					DEFAULT: '#D4842F', // Warm amber for approaching limits
					light: '#E8A55F',
				},
				border: {
					DEFAULT: '#D4C8B3', // Clear, visible borders
					light: '#EBE3D5', // Subtle divisions
				},
			},
			fontFamily: {
				sans: ['Lexend_400Regular', 'System'],
				'sans-medium': ['Lexend_500Medium', 'System'],
				'sans-semibold': ['Lexend_600SemiBold', 'System'],
				'sans-bold': ['Lexend_700Bold', 'System'],
			},
		},
	},
	plugins: [],
};
