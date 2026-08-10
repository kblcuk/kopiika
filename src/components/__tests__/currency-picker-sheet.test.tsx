import { render, fireEvent } from '@testing-library/react-native';
import { CurrencyPickerSheet } from '../currency-picker-sheet';
import { TestIDs } from '@/e2e/support/test-ids';

describe('CurrencyPickerSheet', () => {
	const noop = () => {};

	it('lists the known currencies with symbol and name', () => {
		const { getByTestId, getByText } = render(
			<CurrencyPickerSheet visible selectedCode="EUR" onSelect={noop} onClose={noop} />
		);
		expect(getByTestId(TestIDs.currencyPicker.option('EUR'))).toBeTruthy();
		expect(getByTestId(TestIDs.currencyPicker.option('JPY'))).toBeTruthy();
		expect(getByText('Pound Sterling')).toBeTruthy();
	});

	it('selecting a currency reports its code and closes', () => {
		const onSelect = jest.fn();
		const onClose = jest.fn();
		const { getByTestId } = render(
			<CurrencyPickerSheet visible selectedCode="EUR" onSelect={onSelect} onClose={onClose} />
		);

		fireEvent.press(getByTestId(TestIDs.currencyPicker.option('GBP')));

		expect(onSelect).toHaveBeenCalledWith('GBP');
		expect(onClose).toHaveBeenCalled();
	});

	it('filters the list by code and by name', () => {
		const { getByTestId, queryByTestId } = render(
			<CurrencyPickerSheet visible selectedCode="EUR" onSelect={noop} onClose={noop} />
		);

		fireEvent.changeText(getByTestId(TestIDs.currencyPicker.search), 'pound');

		expect(getByTestId(TestIDs.currencyPicker.option('GBP'))).toBeTruthy();
		expect(queryByTestId(TestIDs.currencyPicker.option('EUR'))).toBeNull();
	});

	it('offers a free-typed three-letter code that is not in the list', () => {
		const onSelect = jest.fn();
		const { getByTestId } = render(
			<CurrencyPickerSheet visible selectedCode="EUR" onSelect={onSelect} onClose={noop} />
		);

		fireEvent.changeText(getByTestId(TestIDs.currencyPicker.search), 'sgd');
		fireEvent.press(getByTestId(TestIDs.currencyPicker.option('SGD')));

		expect(onSelect).toHaveBeenCalledWith('SGD');
	});

	it('offers nothing for input that is not a valid code shape', () => {
		const { getByTestId, queryByTestId } = render(
			<CurrencyPickerSheet visible selectedCode="EUR" onSelect={noop} onClose={noop} />
		);

		fireEvent.changeText(getByTestId(TestIDs.currencyPicker.search), 'zzzz');

		expect(queryByTestId(TestIDs.currencyPicker.option('ZZZZ'))).toBeNull();
		expect(queryByTestId(TestIDs.currencyPicker.option('EUR'))).toBeNull();
	});
});
