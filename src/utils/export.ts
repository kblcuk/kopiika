import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Entity, Plan, Transaction, MarketValueSnapshot } from '@/src/types';

// Convert entities to CSV
export function entitiesToCsv(entities: Entity[]): string {
	const headers = [
		'id',
		'type',
		'name',
		'currency',
		'icon',
		'color',
		'order',
		'row',
		'position',
		'include_in_total',
		'is_deleted',
		'is_investment',
	];
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
	return [headers.join(','), ...rows].join('\n');
}

// Convert plans to CSV
export function plansToCsv(plans: Plan[]): string {
	const headers = ['id', 'entity_id', 'period', 'period_start', 'planned_amount'];
	const rows = plans.map((p) =>
		[p.id, p.entity_id, p.period, p.period_start, p.planned_amount].join(',')
	);
	return [headers.join(','), ...rows].join('\n');
}

// Convert transactions to CSV
export function transactionsToCsv(transactions: Transaction[]): string {
	const headers = [
		'id',
		'from_entity_id',
		'to_entity_id',
		'amount',
		'currency',
		'timestamp',
		'note',
		'series_id',
		'is_confirmed',
	];
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
	return [headers.join(','), ...rows].join('\n');
}

export function marketValueSnapshotsToCsv(marketValueSnapshots: MarketValueSnapshot[]): string {
	const headers = ['id', 'entity_id', 'amount', 'currency', 'date'];
	const rows = marketValueSnapshots.map((snapshot) =>
		[snapshot.id, snapshot.entity_id, snapshot.amount, snapshot.currency, snapshot.date].join(
			','
		)
	);
	return [headers.join(','), ...rows].join('\n');
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
		const combined = [
			'# ENTITIES',
			entitiesToCsv(entities),
			'',
			'# PLANS',
			plansToCsv(plans),
			'',
			'# TRANSACTIONS',
			transactionsToCsv(transactions),
			'',
			'# MARKET_VALUE_SNAPSHOTS',
			marketValueSnapshotsToCsv(marketValueSnapshots),
		].join('\n');

		const combinedFile = new File(dir.uri, `kopiika-export-${timestamp}.csv`);
		combinedFile.write(combined);
		await Sharing.shareAsync(combinedFile.uri, {
			mimeType: 'text/csv',
			dialogTitle: 'Export Kopiika Data',
		});
	}
}

// Export single table
export async function exportEntities(entities: Entity[]): Promise<void> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const path = Paths.cache + `entities-${timestamp}.csv`;

	new File(path).write(entitiesToCsv(entities));

	if (await Sharing.isAvailableAsync()) {
		await Sharing.shareAsync(path, { mimeType: 'text/csv' });
	}
}

export async function exportPlans(plans: Plan[]): Promise<void> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const path = Paths.cache + `plans-${timestamp}.csv`;

	new File(path).write(plansToCsv(plans));

	if (await Sharing.isAvailableAsync()) {
		await Sharing.shareAsync(path, { mimeType: 'text/csv' });
	}
}

export async function exportTransactions(transactions: Transaction[]): Promise<void> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const path = Paths.cache + `transactions-${timestamp}.csv`;

	new File(path).write(transactionsToCsv(transactions));

	if (await Sharing.isAvailableAsync()) {
		await Sharing.shareAsync(path, { mimeType: 'text/csv' });
	}
}
