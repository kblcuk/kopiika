import { searchIcons } from '../icon-search';

describe('searchIcons', () => {
	it('returns the original order for an empty query', () => {
		const icons = ['wallet', 'piggy-bank', 'credit-card'];

		expect(searchIcons(icons, '')).toEqual(icons);
	});

	it('prefers exact and prefix matches over loose matches', () => {
		const icons = ['credit-card', 'car', 'shopping-cart'];

		expect(searchIcons(icons, 'car')).toEqual(['car', 'credit-card', 'shopping-cart']);
	});

	it('matches compact fuzzy queries against hyphenated icon names', () => {
		expect(searchIcons(['piggy-bank', 'plane', 'shopping-cart'], 'pb')).toEqual(['piggy-bank']);
	});

	it('matches multi-word search terms against icon names', () => {
		expect(searchIcons(['shopping-cart', 'credit-card', 'wallet'], 'shopping cart')).toEqual([
			'shopping-cart',
		]);
	});
});
