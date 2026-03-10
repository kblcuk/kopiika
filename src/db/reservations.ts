import { eq, and } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { getDrizzleDb } from './drizzle-client';
import { reservations } from './drizzle-schema';

export type Reservation = InferSelectModel<typeof reservations>;

export async function getAllReservations(): Promise<Reservation[]> {
	const db = await getDrizzleDb();
	return await db.select().from(reservations);
}

/**
 * Creates or updates the reservation amount for an (account, saving) pair.
 * If amount is 0, deletes the row to keep the table clean.
 */
export async function upsertReservation(
	id: string,
	accountEntityId: string,
	savingEntityId: string,
	amount: number
): Promise<void> {
	if (amount <= 0) {
		await deleteReservationByPair(accountEntityId, savingEntityId);
		return;
	}

	const db = await getDrizzleDb();
	await db
		.insert(reservations)
		.values({
			id,
			account_entity_id: accountEntityId,
			saving_entity_id: savingEntityId,
			amount,
		})
		.onConflictDoUpdate({
			target: [reservations.account_entity_id, reservations.saving_entity_id],
			set: { id, amount },
		});
}

export async function deleteReservation(id: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(reservations).where(eq(reservations.id, id));
}

export async function deleteReservationByPair(
	accountEntityId: string,
	savingEntityId: string
): Promise<void> {
	const db = await getDrizzleDb();
	await db
		.delete(reservations)
		.where(
			and(
				eq(reservations.account_entity_id, accountEntityId),
				eq(reservations.saving_entity_id, savingEntityId)
			)
		);
}

export async function deleteAllReservationsForSaving(savingEntityId: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(reservations).where(eq(reservations.saving_entity_id, savingEntityId));
}

export async function deleteAllReservationsForAccount(accountEntityId: string): Promise<void> {
	const db = await getDrizzleDb();
	await db.delete(reservations).where(eq(reservations.account_entity_id, accountEntityId));
}
