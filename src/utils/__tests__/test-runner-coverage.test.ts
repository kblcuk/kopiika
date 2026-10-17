import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, test } from 'bun:test';

const root = resolve(import.meta.dir, '../../..');
const require = createRequire(import.meta.url);

function testFiles(directory: string): string[] {
	return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return testFiles(path);
		return /\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
	});
}

describe('test runner coverage', () => {
	test('assigns every unit, component, screen, and E2E test to exactly one runner', () => {
		const files = ['src', 'app', 'e2e'].flatMap(testFiles);
		const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
		};
		const jestConfig = require(join(root, 'jest.config.js')) as { testMatch: string[] };
		const e2eJestConfig = require(join(root, 'e2e/jest.config.js')) as { testMatch: string[] };
		const knipConfig = JSON.parse(readFileSync(join(root, 'knip.json'), 'utf8')) as {
			entry: string[];
		};
		const bunfig = Bun.TOML.parse(readFileSync(join(root, 'bunfig.toml'), 'utf8')) as {
			test: { pathIgnorePatterns: string[] };
		};
		const miseConfig = Bun.TOML.parse(readFileSync(join(root, 'mise.toml'), 'utf8')) as {
			tasks: { checks: { run: string } };
		};
		const unitCommand = packageJson.scripts['test:unit'] ?? '';
		const unitRoots = unitCommand.match(/bun test (.+)$/)?.[1]?.split(' ') ?? [];
		const jestPatterns = jestConfig.testMatch.map((pattern) =>
			pattern.replace('<rootDir>/', '')
		);
		const e2eJestPatterns = e2eJestConfig.testMatch.map((pattern) =>
			pattern.replace('<rootDir>/', '')
		);

		for (const file of files) {
			const path = relative(root, file).replaceAll('\\', '/');
			const bunOwns =
				unitRoots.some((unitRoot) => path.startsWith(`${unitRoot}/`)) &&
				!bunfig.test.pathIgnorePatterns.some((pattern) =>
					new Bun.Glob(pattern).match(path)
				);
			const jestOwns = jestPatterns.some((pattern) => new Bun.Glob(pattern).match(path));
			const e2eJestOwns = e2eJestPatterns.some((pattern) =>
				new Bun.Glob(pattern).match(path)
			);
			const owners = [bunOwns, jestOwns, e2eJestOwns].filter(Boolean);

			expect(owners, `Expected exactly one test runner to match ${path}`).toHaveLength(1);
		}

		expect(knipConfig.entry).toEqual(
			expect.arrayContaining([
				'e2e/tests/**/*.test.ts',
				'.detoxrc.js',
				'plugins/**/*.js',
				'scripts/**/*.{js,mjs,ts}',
			])
		);
		expect(packageJson.scripts.checks).toMatch(/^bun run /);
		expect(miseConfig.tasks.checks.run).toBe('bun run checks');
		const workflow = readFileSync(join(root, '.forgejo/workflows/ci.yml'), 'utf8');
		expect(workflow).toContain('run: bun run checks');
	});
});
