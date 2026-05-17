import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Entity, Plan, Transaction, MarketValueSnapshot } from '@/src/types';
import {
	ENTITY_HEADERS,
	PLAN_HEADERS,
	TRANSACTION_HEADERS,
	MARKET_VALUE_SNAPSHOT_HEADERS,
} from './csv-spec';

// Convert entities to CSV
function entitiesToCsv(entities: Entity[]): string {
	const rows = entities.map((e) =>
		[
			e.id,
			e.type,
			e.name ? `"${e.name.replace(/"/g, '""')}"` : '',
			e.currency,
			e.icon ?? '',
			e.color ?? '',
			e.order ?? 0,
			e.row,
			e.position,
			e.include_in_total !== false,
			e.is_deleted === true,
			e.is_investment === true,
		].join(',')
	);
	return [ENTITY_HEADERS.join(','), ...rows].join('\n');
}

// Convert plans to CSV
function plansToCsv(plans: Plan[]): string {
	const rows = plans.map((p) =>
		[p.id, p.entity_id, p.period, p.period_start, p.planned_amount].join(',')
	);
	return [PLAN_HEADERS.join(','), ...rows].join('\n');
}

// Convert transactions to CSV
function transactionsToCsv(transactions: Transaction[]): string {
	const rows = transactions.map((t) =>
		[
			t.id,
			t.from_entity_id,
			t.to_entity_id,
			t.amount,
			t.currency,
			t.timestamp,
			t.note ? `"${t.note.replace(/"/g, '""')}"` : '',
			t.series_id ?? '',
			t.is_confirmed !== false,
		].join(',')
	);
	return [TRANSACTION_HEADERS.join(','), ...rows].join('\n');
}

function marketValueSnapshotsToCsv(marketValueSnapshots: MarketValueSnapshot[]): string {
	const rows = marketValueSnapshots.map((snapshot) =>
		[snapshot.id, snapshot.entity_id, snapshot.amount, snapshot.currency, snapshot.date].join(
			','
		)
	);
	return [MARKET_VALUE_SNAPSHOT_HEADERS.join(','), ...rows].join('\n');
}

export interface CombinedCsvInput {
	entities: Entity[];
	plans: Plan[];
	transactions: Transaction[];
	marketValueSnapshots: MarketValueSnapshot[];
}

export function buildCombinedCsv(data: CombinedCsvInput): string {
	return [
		'# ENTITIES',
		entitiesToCsv(data.entities),
		'',
		'# PLANS',
		plansToCsv(data.plans),
		'',
		'# TRANSACTIONS',
		transactionsToCsv(data.transactions),
		'',
		'# MARKET_VALUE_SNAPSHOTS',
		marketValueSnapshotsToCsv(data.marketValueSnapshots),
	].join('\n');
}

// Export all data to CSV files and share
export async function exportAllData(
	entities: Entity[],
	plans: Plan[],
	transactions: Transaction[],
	marketValueSnapshots: MarketValueSnapshot[]
): Promise<void> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

	// Ensure export directory exists
	const dir = new Directory(Paths.cache, 'exports');
	if (!dir.exists) dir.create({ intermediates: true });

	// Create CSV files
	const entitiesFile = new File(dir.uri, `entities-${timestamp}.csv`);
	const plansFile = new File(dir.uri, `plans-${timestamp}.csv`);
	const transactionsFile = new File(dir.uri, `transactions-${timestamp}.csv`);

	entitiesFile.write(entitiesToCsv(entities));
	plansFile.write(plansToCsv(plans));
	transactionsFile.write(transactionsToCsv(transactions));

	// Share all files (will share them one at a time on iOS)
	if (await Sharing.isAvailableAsync()) {
		// Create a combined export for easier sharing
		const combined = buildCombinedCsv({
			entities,
			plans,
			transactions,
			marketValueSnapshots,
		});

		const combinedFile = new File(dir.uri, `kopiika-export-${timestamp}.csv`);
		combinedFile.write(combined);
		await Sharing.shareAsync(combinedFile.uri, {
			mimeType: 'text/csv',
			dialogTitle: 'Export Kopiika Data',
		});
	}
}
