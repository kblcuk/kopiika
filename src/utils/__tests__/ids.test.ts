import { generateId } from '../ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateId', () => {
	it('returns a UUID v4 string', () => {
		const id = generateId();
		expect(id).toMatch(UUID_V4);
	});

	it('produces no collisions across 10k generations', () => {
		const count = 10_000;
		const ids = new Set<string>();
		for (let i = 0; i < count; i++) ids.add(generateId());
		expect(ids.size).toBe(count);
	});
});
