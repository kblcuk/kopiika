import { Alert } from 'react-native';

export type SeriesScope = 'single' | 'future';

/**
 * Show an action sheet asking the user whether to apply an action
 * to a single occurrence or all future occurrences.
 */
export function showSeriesScopeAlert(
	action: 'edit' | 'delete',
	onSelect: (scope: SeriesScope) => void
): void {
	const title = action === 'edit' ? 'Edit Recurring Transaction' : 'Delete Recurring Transaction';
	const message =
		action === 'edit'
			? 'Apply changes to this transaction only, or this and all future occurrences?'
			: 'Delete this transaction only, or this and all future occurrences?';

	Alert.alert(title, message, [
		{ text: 'Cancel', style: 'cancel' },
		{
			text: 'This one only',
			onPress: () => onSelect('single'),
		},
		{
			text: 'All future',
			style: action === 'delete' ? 'destructive' : 'default',
			onPress: () => onSelect('future'),
		},
	]);
}

/**
 * Confirm a delete whose scope the user already picked (when opening the
 * occurrence for editing). Delete stays confirmed because it is destructive,
 * but the scope is restated rather than asked again — see KII-158.
 */
export function showSeriesDeleteConfirm(scope: SeriesScope, onConfirm: () => void): void {
	Alert.alert(
		'Delete Recurring Transaction',
		scope === 'future'
			? 'Delete this and all future occurrences?'
			: 'Delete this occurrence only?',
		[
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Delete', style: 'destructive', onPress: onConfirm },
		]
	);
}
