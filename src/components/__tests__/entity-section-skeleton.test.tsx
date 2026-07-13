import { render } from '@testing-library/react-native';

import { EntitySectionSkeleton } from '@/src/components/entity-section-skeleton';

describe('EntitySectionSkeleton', () => {
	it('renders the section title', () => {
		const { getByText } = render(<EntitySectionSkeleton title="Categories" entityCount={5} />);
		expect(getByText('Categories')).toBeTruthy();
	});

	it('renders one placeholder per entity when under the visible cap', () => {
		const { getAllByTestId } = render(
			<EntitySectionSkeleton title="Accounts" entityCount={3} />
		);
		expect(getAllByTestId('skeleton-bubble')).toHaveLength(3);
	});

	it('caps single-row placeholders at the visible cap (5)', () => {
		const { getAllByTestId } = render(
			<EntitySectionSkeleton title="Savings · Goal" entityCount={20} />
		);
		expect(getAllByTestId('skeleton-bubble')).toHaveLength(5);
	});

	it('reserves multiple rows for a multi-row section (categories, maxRows=3)', () => {
		// 30 entities across 3 rows => 10 columns, capped to 5 => 3 rows * 5 = 15 boxes.
		const { getAllByTestId } = render(
			<EntitySectionSkeleton title="Categories" entityCount={30} maxRows={3} />
		);
		expect(getAllByTestId('skeleton-bubble')).toHaveLength(15);
	});
});
