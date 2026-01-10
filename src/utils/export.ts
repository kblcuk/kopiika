import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Entity, Plan, Transaction } from '@/src/types';

// Convert entities to CSV
export function entitiesToCsv(entities: Entity[]): string {
	const headers = ['id', 'type', 'name', 'currency', 'icon', 'color', 'owner_id', 'order'];
	const rows = entities.map((e) =>
		[
			e.id,
			e.type,
			e.name,
			e.currency,
			e.icon ?? '',
			e.color ?? '',
			e.owner_id ?? '',
			e.order,
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
		].join(',')
	);
	return [headers.join(','), ...rows].join('\n');
}

// Export all data to CSV files and share
export async function exportAllData(
	entities: Entity[],
	plans: Plan[],
	transactions: Transaction[]
): Promise<void> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const baseDir = Paths.cache + 'exports/';

	// Ensure export directory exists
	new Directory(baseDir).create({ intermediates: true });

	// Create CSV files
	const entitiesPath = `${baseDir}entities-${timestamp}.csv`;
	const plansPath = `${baseDir}plans-${timestamp}.csv`;
	const transactionsPath = `${baseDir}transactions-${timestamp}.csv`;

	new File(entitiesPath).write(entitiesToCsv(entities));
	new File(plansPath).write(plansToCsv(plans));
	new File(transactionsPath).write(transactionsToCsv(transactions));

	// Share all files (will share them one at a time on iOS)
	if (await Sharing.isAvailableAsync()) {
		// Create a combined export for easier sharing
		const combinedPath = `${baseDir}kopiika-export-${timestamp}.csv`;
		const combined = [
			'# ENTITIES',
			entitiesToCsv(entities),
			'',
			'# PLANS',
			plansToCsv(plans),
			'',
			'# TRANSACTIONS',
			transactionsToCsv(transactions),
		].join('\n');

		new File(combinedPath).write(combined);
		await Sharing.shareAsync(combinedPath, {
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
