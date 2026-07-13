import { render } from '@testing-library/react-native';

import { LoadingScreen } from '../loading-screen';

describe('LoadingScreen', () => {
	it('renders a spinner surface', () => {
		const { getByTestId } = render(<LoadingScreen />);
		expect(getByTestId('loading-screen')).toBeTruthy();
	});
});
