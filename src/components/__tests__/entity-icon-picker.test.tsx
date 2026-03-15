import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { EntityIconPicker } from '../entity-icon-picker';
import { ICON_OPTIONS } from '@/src/constants/icons';

describe('EntityIconPicker', () => {
	it('shows a responsive two-row preview and can collapse after expanding', () => {
		const icons = ICON_OPTIONS.category;
		const onSelect = jest.fn();
		const previewCount = 8;
		const lastPreviewIcon = icons[previewCount - 1];
		const firstHiddenIcon = icons[previewCount];

		const { getByTestId, getByText, queryByText, queryByTestId } = render(
			<EntityIconPicker
				icons={icons}
				selectedIcon={icons[0]}
				onSelect={onSelect}
				searchInputTestID="entity-icon-search-input"
				optionTestIDPrefix="entity-icon-option"
				emptyStateTestID="entity-icon-empty-state"
			/>
		);

		fireEvent(getByTestId('entity-icon-option-grid'), 'layout', {
			nativeEvent: { layout: { width: 224, height: 112, x: 0, y: 0 } },
		});

		expect(getByTestId(`entity-icon-option-${lastPreviewIcon}`)).toBeTruthy();
		expect(queryByTestId(`entity-icon-option-${firstHiddenIcon}`)).toBeNull();
		expect(getByText(`Show all ${icons.length} icons`)).toBeTruthy();
		expect(queryByText('Show less icons')).toBeNull();

		fireEvent.press(getByText(`Show all ${icons.length} icons`));

		expect(getByTestId(`entity-icon-option-${firstHiddenIcon}`)).toBeTruthy();
		expect(getByText('Show less icons')).toBeTruthy();

		fireEvent.press(getByText('Show less icons'));

		expect(queryByTestId(`entity-icon-option-${firstHiddenIcon}`)).toBeNull();
	});
});
