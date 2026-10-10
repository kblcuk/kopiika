// Metadata-only registry — no React Native imports.
// Used by tests and any code that only needs id/title/summary/related.

export type KbArticleId =
	| 'core-loop'
	| 'entity-types'
	| 'board-gestures'
	| 'transaction-types'
	| 'tabs-and-views'
	| 'reservations'
	| 'refunds'
	| 'recurring'
	| 'splits'
	| 'investment-accounts'
	| 'dashboard'
	| 'summary'
	| 'history'
	| 'settings'
	| 'bubble-settings';

export interface KbArticleMeta {
	id: KbArticleId;
	title: string;
	summary: string;
	related?: KbArticleId[];
}

export const KB_ARTICLES_META: KbArticleMeta[] = [
	{
		id: 'dashboard',
		title: 'Dashboard: understand the numbers',
		summary: 'Understand available, reserved, and total money, plus the three header figures.',
		related: ['entity-types', 'board-gestures', 'reservations', 'bubble-settings'],
	},
	{
		id: 'summary',
		title: 'Summary: compare spending and plans',
		summary: 'Compare monthly spending with plans and see savings progress.',
		related: ['dashboard', 'history'],
	},
	{
		id: 'history',
		title: 'History: find and confirm movements',
		summary: 'Find movements by month, bubble, note, or amount; confirm when money moves.',
		related: ['refunds', 'recurring', 'splits', 'reservations'],
	},
	{
		id: 'settings',
		title: 'Settings: make the app work for you',
		summary:
			'Choose your currency and gestures, manage reminders and backups, or replay practice.',
		related: ['board-gestures', 'core-loop'],
	},
	{
		id: 'bubble-settings',
		title: 'Bubble settings: plans, goals, and accounts',
		summary: 'Set plans and goals, choose a default account, and track investments.',
		related: ['dashboard', 'investment-accounts', 'reservations'],
	},
	{
		id: 'core-loop',
		title: 'Record money and see where it goes',
		summary: 'Plan vs reality, in one local app.',
		related: ['entity-types', 'transaction-types'],
	},
	{
		id: 'entity-types',
		title: 'Income, accounts, spending, and savings',
		summary: 'Income, accounts, categories, savings.',
		related: ['core-loop', 'dashboard', 'bubble-settings'],
	},
	{
		id: 'board-gestures',
		title: 'Board gestures',
		summary: 'Tap, long-press, drag, and the board-wide edit mode.',
		related: ['tabs-and-views', 'transaction-types', 'reservations'],
	},
	{
		id: 'transaction-types',
		title: 'Transactions',
		summary: 'Regular, split, recurring.',
		related: ['splits', 'recurring', 'board-gestures'],
	},
	{
		id: 'tabs-and-views',
		title: 'Tabs & views',
		summary: 'Dashboard · Summary · History · Settings.',
		related: ['dashboard', 'summary', 'history', 'settings'],
	},
	{
		id: 'reservations',
		title: 'Reservations',
		summary: 'Moving money into and out of savings.',
		related: ['entity-types', 'board-gestures'],
	},
	{
		id: 'refunds',
		title: 'Refunds & reverse drags',
		summary: 'Category → Account, Account → Income.',
	},
	{
		id: 'recurring',
		title: 'Recurring transactions',
		summary: 'Templates, series, confirmation states.',
		related: ['transaction-types'],
	},
	{
		id: 'splits',
		title: 'Splitting a transaction',
		summary: 'One source, multiple destinations.',
		related: ['transaction-types'],
	},
	{
		id: 'investment-accounts',
		title: 'Investment accounts',
		summary: 'Snapshots vs purchased price.',
		related: ['entity-types'],
	},
];
