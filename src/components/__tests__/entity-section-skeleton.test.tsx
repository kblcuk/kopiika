import { render } from '@testing-library/react-native';

import { EntitySectionSkeleton } from '@/src/components/entity-section-skeleton';

// The skeleton lays out a fixed number of placeholder columns (off-screen width
// doesn't affect the reserved height that prevents the mount jump), so a
// populated single-row section renders exactly that many bubbles.
const PLACEHOLDER_COLUMNS = 5;

describe('EntitySectionSkeleton', () => {
	it('renders the section title', () => {
		const { getByText } = render(<EntitySectionSkeleton title="Categories" entityCount={2} />);
		expect(getByText('Categories')).toBeTruthy();
	});

	it('renders a single row of placeholders for a default (maxRows=1) section', () => {
		const { getAllByTestId } = render(
			<EntitySectionSkeleton title="Savings · Goal" entityCount={4} />
		);
		expect(getAllByTestId('skeleton-bubble')).toHaveLength(PLACEHOLDER_COLUMNS);
	});

	it('reserves the full maxRows height once the section fills its row budget', () => {
		// maxRows=3 => 3 rows of PLACEHOLDER_COLUMNS bubbles each.
		const { getAllByTestId } = render(
			<EntitySectionSkeleton title="Categories" entityCount={5} maxRows={3} />
		);
		expect(getAllByTestId('skeleton-bubble')).toHaveLength(PLACEHOLDER_COLUMNS * 3);
	});

	it('reserves only the rows a partially-filled section will use (KII-152)', () => {
		// Must track resolveGridRows exactly, or the real grid swapping in for the
		// placeholder shifts everything below it.
		const { getAllByTestId } = render(
			<EntitySectionSkeleton title="Categories" entityCount={2} maxRows={3} />
		);
		expect(getAllByTestId('skeleton-bubble')).toHaveLength(PLACEHOLDER_COLUMNS * 2);
	});

	it('mirrors the real empty-section branch with a single placeholder bubble', () => {
		const { getAllByTestId } = render(
			<EntitySectionSkeleton title="Categories" entityCount={0} maxRows={3} />
		);
		expect(getAllByTestId('skeleton-bubble')).toHaveLength(1);
	});
});
