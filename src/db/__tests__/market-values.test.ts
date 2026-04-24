import { describe, expect, test, beforeEach } from '@jest/globals';
import {
	getMarketValueSnapshots,
	getLatestMarketValueSnapshot,
	createMarketValueSnapshot,
	updateMarketValueSnapshot,
	deleteMarketValueSnapshot,
	deleteAllMarketValueSnapshots,
	getAllMarketValueSnapshots,
} from '../market-values';
import { createEntity } from '../entities';
import { resetDrizzleDb } from '../drizzle-client';
import type { Entity, MarketValueSnapshot } from '@/src/types';

describe('market-values.ts', () => {
	beforeEach(() => {
		resetDrizzleDb();
	});

	const createTestEntity = async (id: string): Promise<Entity> => {
		const entity: Entity = {
			id,
			type: 'account',
			name: 'Investment Account',
			currency: 'USD',
			row: 0,
			position: 0,
			order: 0,
		};
		await createEntity(entity);
		return entity;
	};

	describe('createMarketValueSnapshot', () => {
		test('should create a snapshot', async () => {
			await createTestEntity('entity-1');
			const snapshot: MarketValueSnapshot = {
				id: 'snap-1',
				entity_id: 'entity-1',
				amount: 1500.5,
				currency: 'USD',
				date: Date.now(),
			};
			await createMarketValueSnapshot(snapshot);
			const result = await getLatestMarketValueSnapshot('entity-1');
			expect(result).toEqual(snapshot);
		});
	});

	describe('getMarketValueSnapshots', () => {
		test('should return snapshots sorted newest to oldest', async () => {
			await createTestEntity('entity-1');
			const snapshot1: MarketValueSnapshot = {
				id: 'snap-1',
				entity_id: 'entity-1',
				amount: 1000,
				currency: 'USD',
				date: new Date('2026-01-01').getTime(),
			};
			const snapshot2: MarketValueSnapshot = {
				id: 'snap-2',
				entity_id: 'entity-1',
				amount: 2000,
				currency: 'USD',
				date: new Date('2026-02-01').getTime(),
			};
			await createMarketValueSnapshot(snapshot1);
			await createMarketValueSnapshot(snapshot2);

			const result = await getMarketValueSnapshots('entity-1');
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('snap-2');
			expect(result[1].id).toBe('snap-1');
		});

		test('should return empty array when no snapshots exist', async () => {
			await createTestEntity('entity-1');
			const result = await getMarketValueSnapshots('entity-1');
			expect(result).toEqual([]);
		});
	});

	describe('getLatestMarketValueSnapshot', () => {
		test('should return the most recent snapshot', async () => {
			await createTestEntity('entity-1');
			const snapshot1: MarketValueSnapshot = {
				id: 'snap-1',
				entity_id: 'entity-1',
				amount: 1000,
				currency: 'USD',
				date: new Date('2026-01-01').getTime(),
			};
			const snapshot2: MarketValueSnapshot = {
				id: 'snap-2',
				entity_id: 'entity-1',
				amount: 2000,
				currency: 'USD',
				date: new Date('2026-02-01').getTime(),
			};
			await createMarketValueSnapshot(snapshot1);
			await createMarketValueSnapshot(snapshot2);

			const result = await getLatestMarketValueSnapshot('entity-1');
			expect(result?.id).toBe('snap-2');
			expect(result?.amount).toBe(2000);
		});

		test('should return null when no snapshots exist', async () => {
			await createTestEntity('entity-1');
			const result = await getLatestMarketValueSnapshot('entity-1');
			expect(result).toBeNull();
		});
	});

	describe('updateMarketValueSnapshot', () => {
		test('should update snapshot amount and date', async () => {
			await createTestEntity('entity-1');
			const snapshot: MarketValueSnapshot = {
				id: 'snap-1',
				entity_id: 'entity-1',
				amount: 1000,
				currency: 'USD',
				date: new Date('2026-01-01').getTime(),
			};
			await createMarketValueSnapshot(snapshot);
			await updateMarketValueSnapshot('snap-1', {
				amount: 2500,
				date: new Date('2026-03-01').getTime(),
			});

			const result = await getLatestMarketValueSnapshot('entity-1');
			expect(result?.amount).toBe(2500);
			expect(result?.date).toBe(new Date('2026-03-01').getTime());
		});
	});

	describe('deleteMarketValueSnapshot', () => {
		test('should delete a snapshot', async () => {
			await createTestEntity('entity-1');
			const snapshot: MarketValueSnapshot = {
				id: 'snap-1',
				entity_id: 'entity-1',
				amount: 1000,
				currency: 'USD',
				date: Date.now(),
			};
			await createMarketValueSnapshot(snapshot);
			await deleteMarketValueSnapshot('snap-1');

			const result = await getLatestMarketValueSnapshot('entity-1');
			expect(result).toBeNull();
		});
	});

	describe('deleteAllMarketValueSnapshots', () => {
		test('should delete all snapshots for an entity', async () => {
			await createTestEntity('entity-1');
			await createTestEntity('entity-2');
			const snapshot1: MarketValueSnapshot = {
				id: 'snap-1',
				entity_id: 'entity-1',
				amount: 1000,
				currency: 'USD',
				date: Date.now(),
			};
			const snapshot2: MarketValueSnapshot = {
				id: 'snap-2',
				entity_id: 'entity-1',
				amount: 2000,
				currency: 'USD',
				date: Date.now() - 86400000,
			};
			const snapshot3: MarketValueSnapshot = {
				id: 'snap-3',
				entity_id: 'entity-2',
				amount: 500,
				currency: 'USD',
				date: Date.now(),
			};
			await createMarketValueSnapshot(snapshot1);
			await createMarketValueSnapshot(snapshot2);
			await createMarketValueSnapshot(snapshot3);

			await deleteAllMarketValueSnapshots('entity-1');

			const result1 = await getMarketValueSnapshots('entity-1');
			expect(result1).toEqual([]);

			const result2 = await getMarketValueSnapshots('entity-2');
			expect(result2).toHaveLength(1);
		});
	});

	describe('getAllMarketValueSnapshots', () => {
		test('should return all snapshots sorted by date desc', async () => {
			await createTestEntity('entity-1');
			await createTestEntity('entity-2');
			const snapshot1: MarketValueSnapshot = {
				id: 'snap-1',
				entity_id: 'entity-1',
				amount: 1000,
				currency: 'USD',
				date: new Date('2026-01-01').getTime(),
			};
			const snapshot2: MarketValueSnapshot = {
				id: 'snap-2',
				entity_id: 'entity-2',
				amount: 2000,
				currency: 'USD',
				date: new Date('2026-02-01').getTime(),
			};
			await createMarketValueSnapshot(snapshot1);
			await createMarketValueSnapshot(snapshot2);

			const result = await getAllMarketValueSnapshots();
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('snap-2');
			expect(result[1].id).toBe('snap-1');
		});
	});
});
