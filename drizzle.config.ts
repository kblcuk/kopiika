import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/db/drizzle-schema.ts',
	dialect: 'sqlite',
	driver: 'expo',
	out: './drizzle',
});
