import type { ComponentType } from 'react';
import { KB_ARTICLES_META, type KbArticleId } from './articles-meta';
import { CoreLoop } from './articles/core-loop';
import { EntityTypes } from './articles/entity-types';
import { TransactionTypes } from './articles/transaction-types';
import { TabsAndViews } from './articles/tabs-and-views';
import { Reservations } from './articles/reservations';
import { Refunds } from './articles/refunds';
import { Recurring } from './articles/recurring';
import { Splits } from './articles/splits';
import { InvestmentAccounts } from './articles/investment-accounts';

const BODY_MAP: Record<KbArticleId, ComponentType> = {
	'core-loop': CoreLoop,
	'entity-types': EntityTypes,
	'transaction-types': TransactionTypes,
	'tabs-and-views': TabsAndViews,
	reservations: Reservations,
	refunds: Refunds,
	recurring: Recurring,
	splits: Splits,
	'investment-accounts': InvestmentAccounts,
};

export interface KbArticle {
	id: KbArticleId;
	title: string;
	summary: string;
	body: ComponentType;
	related?: KbArticleId[];
}

export const KB_ARTICLES: KbArticle[] = KB_ARTICLES_META.map((meta) => ({
	...meta,
	body: BODY_MAP[meta.id],
}));

export function findArticle(id: string): KbArticle | undefined {
	return KB_ARTICLES.find((a) => a.id === id);
}
