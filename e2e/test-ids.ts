export const TestIDs = {
	homeScreen: 'home-screen',
	homeScrollView: 'home-scroll-view',

	addTransactionButton: 'add-transaction-button',
	addEntityButton: (type: string) => `add-entity-button-${type}`,
	entityOption: (name: string) => `entity-option-${name}`,
	fromOption: (name: string) => `from-option-${name}`,
	toOption: (name: string) => `to-option-${name}`,

	entityBubble: (name: string) => `entity-bubble-${name}`,
	entityAmount: (name: string) => `entity-amount-${name}`,

	transaction: {
		fromButton: 'transaction-from-button',
		toButton: 'transaction-to-button',
		amountInput: 'transaction-amount-input',
		saveButton: 'transaction-save-button',
		cancelButton: 'transaction-cancel-button',
		formScroll: 'transaction-form-scroll',
		noteInput: 'transaction-note-input',
		suggestedAmountButton: 'transaction-suggested-amount-button',
		splitToggleButton: 'split-toggle-button',
		splitAddButton: 'split-add-button',
		splitMergeButton: 'split-merge-button',
		splitAnchorAmount: 'split-anchor-amount',
		splitRow: (index: number) => `split-row-${index}`,
		splitEntity: (index: number) => `split-entity-${index}`,
		splitAmount: (index: number) => `split-amount-${index}`,
		splitRemove: (index: number) => `split-remove-${index}`,
		splitRemainingChip: (index: number) => `split-remaining-chip-${index}`,
	},

	entityCreate: {
		nameInput: 'entity-create-name-input',
		amountInput: 'entity-create-amount-input',
		saveButton: 'entity-create-save-button',
		cancelButton: 'entity-create-cancel-button',
	},

	entityDetail: {
		nameInput: 'entity-detail-name-input',
		amountInput: 'entity-detail-amount-input',
		actualInput: 'entity-detail-actual-input',
		saveButton: 'entity-detail-save-button',
		cancelButton: 'entity-detail-cancel-button',
		deleteButton: 'entity-detail-delete-button',
		iconPickerToggle: 'entity-detail-icon-picker-toggle',
		includeInTotalSwitch: 'entity-detail-include-in-total-switch',
		savingReservationsSection: 'saving-reservations-section',
		savingReservationRow: (accountId: string) => `saving-reservation-row-${accountId}`,
	},

	incomeToggleButton: 'income-toggle-button',

	entitySelectionSheet: {
		closeButton: 'entity-selection-sheet-close',
		fromSheet: 'entity-selection-sheet-from',
		toSheet: 'entity-selection-sheet-to',
	},

	refundPicker: {
		close: 'refund-picker-close',
	},

	reservation: {
		modal: 'reservation-modal',
		backdrop: 'reservation-backdrop',
		submitButton: 'reservation-submit-button',
		clearButton: 'reservation-clear-button',
	},

	whatsNew: {
		backdrop: 'whats-new-backdrop',
		dismiss: 'whats-new-dismiss',
	},
} as const;
