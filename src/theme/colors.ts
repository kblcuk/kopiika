/**
 * Single source of truth for all design system colors.
 *
 * Consumed by:
 *   - tailwind.config.ts  (theme tokens → NativeWind classes)
 *   - Components          (inline color props, SVG strokes, native props)
 *
 * Add new values here; never inline raw hex strings in components.
 */
export const colors = {
	// ── Paper (backgrounds) ─────────────────────────────────────────────────
	paper: {
		DEFAULT: '#F8F4ED', // Main background
		50: '#FFFEFA', // Highlights / modal sheets
		100: '#F8F4ED', // Alias of DEFAULT
		200: '#EBE3D5', // Subtle borders / dividers
		300: '#D4C8B3', // Disabled states
		warm: '#FFFBF5', // Icon on accent background, switch thumb
	},

	// ── Ink (text & icons) ──────────────────────────────────────────────────
	ink: {
		DEFAULT: '#1A1410', // Primary text — highest contrast
		light: '#3D3426', // Secondary text
		medium: '#4A3F2E', // Chevrons, close icons
		muted: '#6B5D4A', // Tertiary text / secondary icons
		placeholder: '#9C8B74', // TextInput placeholder text & ghost icons
	},

	// ── Accent (income / primary actions) ───────────────────────────────────
	accent: {
		DEFAULT: '#D4652F', // Terracotta — primary CTA
		dark: '#9B4621', // Pressed / deep accent
		deeper: '#B85C38', // Native date-picker accentColor (iOS)
		light: '#E8926A', // Soft accent
		glow: 'rgba(212, 101, 47, 0.25)', // Drag-hover glow overlay
	},

	// ── Semantic states ──────────────────────────────────────────────────────
	negative: {
		DEFAULT: '#C23030', // Overspending / destructive
		light: '#E85555',
	},
	positive: {
		DEFAULT: '#2F7D4A', // Categories / success
		light: '#4A9D65',
	},
	info: {
		DEFAULT: '#2B5F8A', // Savings goals
		light: '#4A80AB',
	},
	warning: {
		DEFAULT: '#D4842F', // Approaching limit
		light: '#E8A55F',
	},

	// ── Borders ──────────────────────────────────────────────────────────────
	border: {
		DEFAULT: '#D4C8B3',
		light: '#EBE3D5',
		dashed: '#C8BBAA', // Dashed placeholder borders
	},

	// ── Inverse surface (icons/text on colored backgrounds) ─────────────────
	on: {
		color: '#FFFFFF', // Icon/text on accent, negative, or other saturated bg
	},

	// ── Progress ring tracks (SVG / imperative use only) ────────────────────
	track: {
		DEFAULT: '#F5F1EB', // Neutral
		healthy: '#E8F5EC', // Green tint
		warning: '#FFF4E6', // Amber tint
		overspent: '#FDEAEA', // Red tint
	},
};
