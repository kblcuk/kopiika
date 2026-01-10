/**
 * Mock implementation of expo-sqlite for Jest tests
 * This allows tests to run without the actual expo-sqlite native module
 */

export interface SQLiteDatabase {
	getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
	getFirstAsync<T>(sql: string, params?: any[]): Promise<T | null>;
	runAsync(sql: string, params?: any[]): Promise<void>;
	execAsync(sql: string): Promise<void>;
}

// Mock functions - actual implementation comes from test-utils
export function openDatabaseAsync(name: string): Promise<SQLiteDatabase> {
	throw new Error('Mock implementation - use test-utils instead');
}

export function openDatabaseSync(name: string): SQLiteDatabase {
	throw new Error('Mock implementation - use test-utils instead');
}
