import type { ComponentType } from 'react';
import { KB_ARTICLES_META, type KbArticleId } from './articles-meta';
import { CoreLoop } from './articles/core-loop';
import { EntityTypes } from './articles/entity-types';
import { BoardGestures } from './articles/board-gestures';
import { TransactionTypes } from './articles/transaction-types';
import { TabsAndViews } from './articles/tabs-and-views';
import { Reservations } from './articles/reservations';
import { Refunds } from './articles/refunds';
import { Recurring } from './articles/recurring';
import { Splits } from './articles/splits';
import { InvestmentAccounts } from './articles/investment-accounts';

import { Dashboard } from './articles/dashboard';
import { Summary } from './articles/summary';
import { History } from './articles/history';
import { SettingsHelp } from './articles/settings';
import { BubbleSettings } from './articles/bubble-settings';

const BODY_MAP: Record<KbArticleId, ComponentType> = {
	dashboard: Dashboard,
	summary: Summary,
	history: History,
	settings: SettingsHelp,
	'bubble-settings': BubbleSettings,

	'core-loop': CoreLoop,
	'entity-types': EntityTypes,
	'board-gestures': BoardGestures,
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
