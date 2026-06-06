import React from 'react';
import { Modal, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { PageSheetModal } from '../page-sheet-modal';

describe('PageSheetModal', () => {
	it('renders children when visible', () => {
		const { getByText } = render(
			<PageSheetModal visible={true} onRequestClose={jest.fn()}>
				<Text>hello</Text>
			</PageSheetModal>
		);
		expect(getByText('hello')).toBeTruthy();
	});

	it('forwards testID to the inner container', () => {
		const { getByTestId } = render(
			<PageSheetModal visible={true} onRequestClose={jest.fn()} testID="my-anchor">
				<Text>hello</Text>
			</PageSheetModal>
		);
		expect(getByTestId('my-anchor')).toBeTruthy();
	});

	it('invokes onRequestClose when the native Modal fires it', () => {
		const onRequestClose = jest.fn();
		const { UNSAFE_getByType } = render(
			<PageSheetModal visible={true} onRequestClose={onRequestClose}>
				<Text>hello</Text>
			</PageSheetModal>
		);
		fireEvent(UNSAFE_getByType(Modal), 'requestClose');
		expect(onRequestClose).toHaveBeenCalledTimes(1);
	});

	it('passes visible=false to the underlying Modal when hidden', () => {
		const { UNSAFE_getByType } = render(
			<PageSheetModal visible={false} onRequestClose={jest.fn()}>
				<Text>hello</Text>
			</PageSheetModal>
		);
		expect(UNSAFE_getByType(Modal).props.visible).toBe(false);
	});
});
