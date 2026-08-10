import * as db from '@/src/db';
import * as schema from '@/src/db/drizzle-schema';
import type { Entity, Transaction } from '@/src/types';
import type { RecurrenceTemplate } from '@/src/types/recurrence';
import {
	ensureValid,
	validateTransaction,
	validateUpdate,
} from '@/src/utils/transaction-validation';
import { defaultIsConfirmed } from '@/src/utils/transaction-builder';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { isEntityActive } from '@/src/utils/entity-display';
import { generateId } from '@/src/utils/ids';
import { getReservationForPair } from '@/src/utils/savings-transactions';
import type { Op, OpResult, OpSource } from './ops';

/**
 * Read-only snapshot the chokepoint validates against. For `local` ops this is
 * the current store state; for future `inbound` ops it will be the local DB
 * state at apply time.
 */
export interface ApplyContext {
	entities: Entity[];
	transactions: Transaction[];
	recurrenceTemplates: RecurrenceTemplate[];
}

/**
 * The single mutation chokepoint. Every transaction-family mutation funnels
 * through here. Today it validates + persists + returns the persisted rows;
 * later PRs add idempotency (op_id), signature verification (inbound),
 * journaling, HLC stamping, and conflict resolution — all inside this function.
 */
export async function applyOperation(
	op: Op,
	source: OpSource,
	ctx: ApplyContext
): Promise<OpResult> {
	// `source` is reserved for future signature-verify + journaling (KII-99).
	// No behavioural branch in the no-op phase.
	void source;

	switch (op.kind) {
		case 'transaction.create': {
			ensureValid(validateTransaction(op.transaction, ctx.entities));
			const withConfirm = {
				...op.transaction,
				is_confirmed:
					op.transaction.is_confirmed ?? defaultIsConfirmed(op.transaction.timestamp),
			};
			const created = await db.createTransaction(withConfirm);
			return { kind: 'transaction.create', created };
		}
		case 'transaction.batch_create': {
			const prepared = op.transactions.map((tx) => {
				ensureValid(validateTransaction(tx, ctx.entities));
				return {
					...tx,
					is_confirmed: tx.is_confirmed ?? defaultIsConfirmed(tx.timestamp),
				};
			});
			const created = await db.createTransactionBatch(prepared);
			return { kind: 'transaction.batch_create', created };
		}
		case 'transaction.update': {
			const existing = ctx.transactions.find((t) => t.id === op.id);
			if (!existing) {
				console.warn(`applyOperation: cannot update unknown transaction: ${op.id}`);
				return { kind: 'transaction.update', updated: null };
			}
			ensureValid(validateUpdate(existing, op.updates, ctx.entities));
			const updated = await db.updateTransaction(op.id, op.updates);
			return { kind: 'transaction.update', updated };
		}
		case 'transaction.delete': {
			await db.deleteTransaction(
				op.id,
				op.seriesExclusion ? { seriesExclusion: op.seriesExclusion } : undefined
			);
			return { kind: 'transaction.delete' };
		}
		case 'transaction.confirm': {
			const confirmed = await db.confirmTransactionsBatch(op.ids);
			return { kind: 'transaction.confirm', confirmed };
		}
		case 'entity.create': {
			const created = await db.createEntity(op.entity);
			return { kind: 'entity.create', created };
		}
		case 'entity.update': {
			const updated = await db.updateEntity(op.entity, op.options);
			return { kind: 'entity.update', updated };
		}
		case 'entity.delete': {
			if (op.id === BALANCE_ADJUSTMENT_ENTITY_ID) {
				console.warn('Cannot delete system entity');
				return { kind: 'entity.delete', entities: null };
			}
			const entity = ctx.entities.find((e) => e.id === op.id);
			if (!isEntityActive(entity)) {
				return { kind: 'entity.delete', entities: null };
			}
			// deleteEntityAndReindex closes position gaps; re-read the full list to
			// keep ordering consistent with how `initialize` hydrates the store.
			await db.deleteEntityAndReindex(op.id);
			const entities = await db.getAllEntities();
			return { kind: 'entity.delete', entities };
		}
		case 'plan.set': {
			const entityActive = ctx.entities.some(
				(e) => e.id === op.plan.entity_id && isEntityActive(e)
			);
			if (!entityActive) {
				console.warn(`Cannot set plan for non-existent entity: ${op.plan.entity_id}`);
				return { kind: 'plan.set', plan: null };
			}
			const plan = await db.upsertPlan(op.plan);
			return { kind: 'plan.set', plan };
		}
		case 'plan.delete': {
			await db.deletePlan(op.id);
			return { kind: 'plan.delete' };
		}
		case 'reservation.set': {
			const account = ctx.entities.find((e) => e.id === op.accountEntityId);
			const saving = ctx.entities.find((e) => e.id === op.savingEntityId);
			if (!account || !saving) {
				throw new Error(
					`Cannot reserve with non-existent entities: account=${op.accountEntityId}, saving=${op.savingEntityId}`
				);
			}

			// Intent semantics: the op carries the target total; the delta against
			// the local view is computed at apply time (LWW on target, KII-96).
			const currentNetMinor = getReservationForPair(
				ctx.transactions,
				op.accountEntityId,
				op.savingEntityId
			);
			const deltaMinor = op.desiredTotalMinor - currentNetMinor;
			if (deltaMinor === 0) return { kind: 'reservation.set', created: null };

			const transaction: Transaction = {
				id: generateId(),
				from_entity_id: deltaMinor > 0 ? op.accountEntityId : op.savingEntityId,
				to_entity_id: deltaMinor > 0 ? op.savingEntityId : op.accountEntityId,
				amount_minor: Math.abs(deltaMinor),
				currency: account.currency,
				timestamp: Date.now(),
			};
			ensureValid(validateTransaction(transaction, ctx.entities));
			const created = await db.createTransaction(transaction);
			return { kind: 'reservation.set', created };
		}
		case 'transaction.split': {
			const prepared: Transaction[] = op.rows.map((tx) => {
				ensureValid(validateTransaction(tx, ctx.entities));
				return {
					...tx,
					// Split children are never part of the parent series — strip unconditionally.
					series_id: undefined,
					is_confirmed: tx.is_confirmed ?? defaultIsConfirmed(tx.timestamp),
				};
			});
			const created = await db.replaceTransactionAtomic(op.originalId, prepared, {
				seriesExclusion: op.seriesExclusion,
			});
			return { kind: 'transaction.split', created };
		}
		case 'recurrence.exclude': {
			await db.addExclusion(op.seriesId, op.timestamp);
			return { kind: 'recurrence.exclude' };
		}
		case 'recurrence.create': {
			// Validate the entity pair the same way backfillRecurrences does —
			// every generated occurrence shares the template's from/to/currency.
			ensureValid(
				validateTransaction(
					{
						from_entity_id: op.template.from_entity_id,
						to_entity_id: op.template.to_entity_id,
						amount_minor: op.template.amount_minor,
						currency: op.template.currency,
					},
					ctx.entities
				)
			);
			const created = await db.createRecurrenceTemplate(op.template);
			return { kind: 'recurrence.create', created };
		}
		case 'recurrence.update_future': {
			const anchor = ctx.transactions.find((t) => t.id === op.anchorId);
			if (!anchor?.series_id) {
				console.warn(
					`applyOperation: cannot scope-update unknown or non-series transaction: ${op.anchorId}`
				);
				return { kind: 'recurrence.update_future', template: null, transactions: [] };
			}
			ensureValid(validateUpdate(anchor, op.updates, ctx.entities));

			const seriesId = anchor.series_id;

			// `series_id` has no FK, so an occurrence can outlive its template (e.g. an
			// import dropped it). Update the template only when it still exists, but
			// always apply the edit to this occurrence and the future ones — with no
			// series left there is nothing else to update, so skipping the rows would
			// silently drop the user's edit rather than rejecting it. Mirrors the
			// delete/split orphan tolerance.
			let template: RecurrenceTemplate | null = null;
			if (ctx.recurrenceTemplates.some((t) => t.id === seriesId)) {
				const templateUpdates: Partial<RecurrenceTemplate> = {};
				if (op.updates.amount_minor !== undefined)
					templateUpdates.amount_minor = op.updates.amount_minor;
				if (op.updates.from_entity_id !== undefined)
					templateUpdates.from_entity_id = op.updates.from_entity_id;
				if (op.updates.to_entity_id !== undefined)
					templateUpdates.to_entity_id = op.updates.to_entity_id;
				if (op.updates.note !== undefined) templateUpdates.note = op.updates.note;
				template = await db.updateRecurrenceTemplate(seriesId, templateUpdates);
			} else {
				console.warn(
					`updateTransactionWithScope: recurrence template ${seriesId} not found; updating future occurrences without touching a template`
				);
			}

			const transactions = await db.updateTransactionsBySeriesFuture(
				seriesId,
				anchor.timestamp,
				op.updates
			);
			return { kind: 'recurrence.update_future', template, transactions };
		}
		case 'recurrence.delete_future': {
			await db.deleteTransactionsBySeriesFuture(op.seriesId, op.fromTimestamp);
			const remaining = ctx.transactions.filter(
				(t) => t.series_id === op.seriesId && t.timestamp < op.fromTimestamp
			);
			let template: RecurrenceTemplate | null;
			if (remaining.length === 0) {
				template = await db.softDeleteRecurrenceTemplate(op.seriesId);
			} else {
				const lastRemaining = Math.max(...remaining.map((t) => t.timestamp));
				template = await db.updateRecurrenceTemplate(op.seriesId, {
					end_date: lastRemaining,
				});
			}
			return { kind: 'recurrence.delete_future', template };
		}
		case 'recurrence.deactivate': {
			await db.deleteTransactionsBySeriesFuture(op.seriesId, op.fromTimestamp);
			const template = await db.softDeleteRecurrenceTemplate(op.seriesId);
			return { kind: 'recurrence.deactivate', template };
		}
		case 'market_value.create': {
			const created = await db.createMarketValueSnapshot(op.snapshot);
			return { kind: 'market_value.create', created };
		}
		case 'market_value.update': {
			const updated = await db.updateMarketValueSnapshot(op.id, op.updates);
			return { kind: 'market_value.update', updated };
		}
		case 'market_value.delete': {
			await db.deleteMarketValueSnapshot(op.id);
			return { kind: 'market_value.delete' };
		}
		case 'market_value.delete_all': {
			await db.deleteAllMarketValueSnapshots(op.entityId);
			return { kind: 'market_value.delete_all' };
		}
		case 'import.replace_all': {
			const drizzleDb = await db.getDrizzleDb();

			// Wrap in transaction so a mid-import failure doesn't leave an empty DB
			const now = Date.now();
			drizzleDb.transaction((tx) => {
				// Delete in FK-safe order: snapshots → transactions → exclusions →
				// recurrenceTemplates → plans → entities (KII-123 added exclusions).
				tx.delete(schema.marketValueSnapshots).run();
				tx.delete(schema.transactions).run();
				tx.delete(schema.recurrenceExclusions).run();
				tx.delete(schema.recurrenceTemplates).run();
				tx.delete(schema.plans).run();
				tx.delete(schema.entities).run();

				// Insert in FK-safe order: entities → plans → recurrenceTemplates → transactions → snapshots.
				// `created_at`/`updated_at` come from CSV when present (round-trip
				// preserves write-time across export/import); otherwise stamp now.
				for (const entity of op.entities) {
					tx.insert(schema.entities)
						.values({
							id: entity.id,
							type: entity.type,
							name: entity.name,
							currency: entity.currency,
							icon: entity.icon ?? null,
							color: entity.color ?? null,
							row: entity.row,
							position: entity.position,
							include_in_total: entity.include_in_total ?? true,
							is_deleted: entity.is_deleted ?? false,
							is_default: entity.is_default ?? false,
							is_investment: entity.is_investment ?? false,
							created_at: entity.created_at ?? now,
							updated_at: entity.updated_at ?? now,
						})
						.run();
				}
				for (const plan of op.plans) {
					tx.insert(schema.plans)
						.values({
							...plan,
							created_at: plan.created_at ?? now,
							updated_at: plan.updated_at ?? now,
						})
						.run();
				}
				for (const template of op.recurrenceTemplates) {
					tx.insert(schema.recurrenceTemplates)
						.values({
							id: template.id,
							from_entity_id: template.from_entity_id,
							to_entity_id: template.to_entity_id,
							amount_minor: template.amount_minor,
							currency: template.currency,
							note: template.note ?? null,
							rule: template.rule,
							start_date: template.start_date,
							end_date: template.end_date ?? null,
							end_count: template.end_count ?? null,
							is_deleted: template.is_deleted ?? false,
							created_at: template.created_at,
							updated_at: template.updated_at ?? template.created_at,
						})
						.run();
					// KII-123: write exclusions into the normalized table. We do this
					// inside the FK-safe insert window (templates already inserted in
					// the loop above, so each exclusion's FK target exists).
					for (const ts of template.exclusions ?? []) {
						tx.insert(schema.recurrenceExclusions)
							.values({ template_id: template.id, timestamp: ts })
							.onConflictDoNothing()
							.run();
					}
				}
				for (const txn of op.transactions) {
					tx.insert(schema.transactions)
						.values({
							id: txn.id,
							from_entity_id: txn.from_entity_id,
							to_entity_id: txn.to_entity_id,
							amount_minor: txn.amount_minor,
							currency: txn.currency,
							timestamp: txn.timestamp,
							note: txn.note ?? null,
							series_id: txn.series_id ?? null,
							split_id: txn.split_id ?? null,
							is_confirmed: txn.is_confirmed ?? true,
							created_at: txn.created_at ?? now,
							updated_at: txn.updated_at ?? now,
						})
						.run();
				}
				for (const snapshot of op.marketValueSnapshots) {
					tx.insert(schema.marketValueSnapshots)
						.values({
							...snapshot,
							created_at: snapshot.created_at ?? now,
							updated_at: snapshot.updated_at ?? now,
						})
						.run();
				}
			});

			// Re-read all data from DB into store state
			const [
				entities,
				plans,
				transactions,
				rawTemplates,
				marketValueSnapshots,
				exclusionsByTemplate,
			] = await Promise.all([
				db.getAllEntities(),
				db.getAllPlans(),
				db.getAllTransactions(),
				db.getAllRecurrenceTemplates(),
				db.getAllMarketValueSnapshots(),
				db.getAllExclusionsByTemplate(),
			]);
			const recurrenceTemplates: RecurrenceTemplate[] = rawTemplates.map((t) => ({
				...t,
				exclusions: exclusionsByTemplate.get(t.id) ?? [],
			}));

			return {
				kind: 'import.replace_all',
				entities,
				plans,
				transactions,
				recurrenceTemplates,
				marketValueSnapshots,
			};
		}
		default: {
			const _exhaustive: never = op;
			throw new Error(`applyOperation: unsupported op kind "${JSON.stringify(_exhaustive)}"`);
		}
	}
}
