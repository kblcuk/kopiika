import { DEFAULT_ICONS, ICON_OPTIONS } from '@/src/constants/icons';
import { iconRegistry } from '@/src/constants/icon-registry';

describe('icon options', () => {
	it('keeps defaults inside each entity type option list', () => {
		for (const [entityType, defaultIcon] of Object.entries(DEFAULT_ICONS)) {
			expect(ICON_OPTIONS[entityType as keyof typeof ICON_OPTIONS]).toContain(defaultIcon);
		}
	});

	it('only exposes icons that exist in the registry', () => {
		for (const icons of Object.values(ICON_OPTIONS)) {
			for (const icon of icons) {
				expect(iconRegistry).toHaveProperty(icon);
			}
		}
	});

	it('keeps all entity types on a broad icon catalog without duplicates', () => {
		const counts = Object.values(ICON_OPTIONS).map((icons) => icons.length);

		expect(counts[0]).toBeGreaterThan(40);
		expect(new Set(counts).size).toBe(1);

		for (const [entityType, icons] of Object.entries(ICON_OPTIONS)) {
			expect(icons[0]).toBe(DEFAULT_ICONS[entityType as keyof typeof DEFAULT_ICONS]);
			expect(new Set(icons).size).toBe(icons.length);
		}
	});
});
