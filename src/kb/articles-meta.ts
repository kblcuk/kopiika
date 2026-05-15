// Metadata-only registry — no React Native imports.
// Used by tests and any code that only needs id/title/summary/related.

export type KbArticleId =
	| 'core-loop'
	| 'entity-types'
	| 'transaction-types'
	| 'tabs-and-views'
	| 'reservations'
	| 'refunds'
	| 'recurring'
	| 'splits'
	| 'investment-accounts';

export interface KbArticleMeta {
	id: KbArticleId;
	title: string;
	summary: string;
	related?: KbArticleId[];
}

export const KB_ARTICLES_META: KbArticleMeta[] = [
	{
		id: 'core-loop',
		title: 'The core loop',
		summary: 'Plan vs reality, in one local app.',
		related: ['entity-types', 'transaction-types'],
	},
	{
		id: 'entity-types',
		title: 'Entity types',
		summary: 'Income, accounts, categories, savings.',
		related: ['core-loop', 'tabs-and-views'],
	},
	{
		id: 'transaction-types',
		title: 'Transactions',
		summary: 'Regular, split, recurring.',
		related: ['splits', 'recurring'],
	},
	{
		id: 'tabs-and-views',
		title: 'Tabs & views',
		summary: 'Home · Summary · History · Settings.',
	},
	{
		id: 'reservations',
		title: 'Reservations',
		summary: 'Moving money into and out of savings.',
		related: ['entity-types'],
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

export function findArticleMeta(id: string): KbArticleMeta | undefined {
	return KB_ARTICLES_META.find((a) => a.id === id);
}
