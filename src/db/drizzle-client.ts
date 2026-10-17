export { default as getDrizzleDb, resetDb as resetDrizzleDb } from './db';

/** The transaction handle drizzle passes to a `db.transaction((tx) => …)` callback. */
export type DrizzleTx = Parameters<
	Parameters<Awaited<ReturnType<typeof import('./db').default>>['transaction']>[0]
>[0];
