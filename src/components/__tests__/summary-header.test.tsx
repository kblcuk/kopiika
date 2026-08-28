import { render, renderHook } from '@testing-library/react-native';
import { useSummary, SummaryHeader } from '../summary-header';
import { useStore } from '@/src/store';
import type { Entity, Plan, Transaction } from '@/src/types';

describe('useSummary', () => {
	const mockIncome: Entity = {
		id: 'income-1',
		type: 'income',
		name: 'Salary',
		currency: 'USD',
		row: 0,
		position: 0,
	};

	const mockAccount: Entity = {
		id: 'account-1',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		row: 0,
		position: 0,
	};

	const mockAccount2: Entity = {
		id: 'account-2',
		type: 'account',
		name: 'Savings',
		currency: 'USD',
		row: 0,
		position: 1,
	};

	const mockCategory: Entity = {
		id: 'category-1',
		type: 'category',
		name: 'Groceries',
		currency: 'USD',
		row: 0,
		position: 0,
	};

	const currentPeriod = '2026-01';
	const periodStart = new Date('2026-01-01T00:00:00').getTime();

	beforeEach(() => {
		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			balanceSeed: [],
			currentPeriod,
			isLoading: false,
			draggedEntity: null,
			incomeVisible: false,
		});
	});

	it('should include income-to-account transfers in balance', () => {
		// This is the bug we fixed: income → account should increase balance
		const incomeToAccount: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount_minor: 500000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount],
			transactions: [incomeToAccount],
		});

		const { result } = renderHook(() => useSummary());

		// Balance should be 500000 minor units ($5000 received).
		expect(result.current.balance).toBe(500000);
	});

	it('should calculate balance as sum of all account actuals', () => {
		const incomeToAccount1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount_minor: 300000,
			currency: 'USD',
			timestamp: periodStart,
		};

		const incomeToAccount2: Transaction = {
			id: 'tx-2',
			from_entity_id: 'income-1',
			to_entity_id: 'account-2',
			amount_minor: 200000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount, mockAccount2],
			transactions: [incomeToAccount1, incomeToAccount2],
		});

		const { result } = renderHook(() => useSummary());

		// Balance: 300000 + 200000 = 500000 minor units ($5000).
		expect(result.current.balance).toBe(500000);
	});

	it('should subtract outgoing transactions from balance', () => {
		const incomeToAccount: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount_minor: 500000,
			currency: 'USD',
			timestamp: periodStart,
		};

		const accountToCategory: Transaction = {
			id: 'tx-2',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 150000,
			currency: 'USD',
			timestamp: periodStart + 1000,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount, mockCategory],
			transactions: [incomeToAccount, accountToCategory],
		});

		const { result } = renderHook(() => useSummary());

		// Balance: 500000 - 150000 = 350000 minor units ($3500).
		expect(result.current.balance).toBe(350000);
		// Expenses: 150000 minor units ($1500).
		expect(result.current.expenses).toBe(150000);
	});

	it('should calculate expenses as sum of category actuals', () => {
		const mockCategory2: Entity = {
			id: 'category-2',
			type: 'category',
			name: 'Transport',
			currency: 'USD',
			row: 0,
			position: 1,
		};

		const tx1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
			currency: 'USD',
			timestamp: periodStart,
		};

		const tx2: Transaction = {
			id: 'tx-2',
			from_entity_id: 'account-1',
			to_entity_id: 'category-2',
			amount_minor: 15000,
			currency: 'USD',
			timestamp: periodStart + 1000,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory, mockCategory2],
			transactions: [tx1, tx2],
		});

		const { result } = renderHook(() => useSummary());

		// Expenses: 20000 + 15000 = 35000 minor units ($350).
		expect(result.current.expenses).toBe(35000);
	});

	it('should calculate remaining as planned minus expenses', () => {
		const mockCategory2: Entity = {
			id: 'category-2',
			type: 'category',
			name: 'Transport',
			currency: 'USD',
			row: 0,
			position: 1,
		};

		const plan1: Plan = {
			id: 'plan-1',
			entity_id: 'category-1',
			period: 'all-time',
			period_start: currentPeriod,
			planned_amount_minor: 50000,
		};

		const plan2: Plan = {
			id: 'plan-2',
			entity_id: 'category-2',
			period: 'all-time',
			period_start: currentPeriod,
			planned_amount_minor: 30000,
		};

		const tx1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory, mockCategory2],
			plans: [plan1, plan2],
			transactions: [tx1],
		});

		const { result } = renderHook(() => useSummary());

		// Remaining should be (500 + 300) - 200 = 600
		expect(result.current.remaining).toBe(60000);
	});

	it('should return zero remaining when a category is overspent', () => {
		const plan1: Plan = {
			id: 'plan-1',
			entity_id: 'category-1',
			period: 'all-time',
			period_start: currentPeriod,
			planned_amount_minor: 10000,
		};

		const tx1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 25000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory],
			plans: [plan1],
			transactions: [tx1],
		});

		const { result } = renderHook(() => useSummary());

		// Overspent category contributes 0 to remaining, not negative
		expect(result.current.remaining).toBe(0);
	});

	it('should not let overspent categories reduce remaining from other categories', () => {
		const mockCategory2: Entity = {
			id: 'category-2',
			type: 'category',
			name: 'Transport',
			currency: 'USD',
			row: 0,
			position: 1,
		};

		const plan1: Plan = {
			id: 'plan-1',
			entity_id: 'category-1',
			period: 'all-time',
			period_start: currentPeriod,
			planned_amount_minor: 50000,
		};

		const plan2: Plan = {
			id: 'plan-2',
			entity_id: 'category-2',
			period: 'all-time',
			period_start: currentPeriod,
			planned_amount_minor: 10000,
		};

		// category-1: spent 200 of 500 → 300 remaining
		const tx1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
			currency: 'USD',
			timestamp: periodStart,
		};

		// category-2: spent 250 of 100 → overspent, contributes 0
		const tx2: Transaction = {
			id: 'tx-2',
			from_entity_id: 'account-1',
			to_entity_id: 'category-2',
			amount_minor: 25000,
			currency: 'USD',
			timestamp: periodStart + 1000,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory, mockCategory2],
			plans: [plan1, plan2],
			transactions: [tx1, tx2],
		});

		const { result } = renderHook(() => useSummary());

		// Remaining: 300 (from category-1) + 0 (from overspent category-2) = 300
		expect(result.current.remaining).toBe(30000);
		// Expenses: 20000 + 25000 = 45000 minor units ($450).
		expect(result.current.expenses).toBe(45000);
	});

	it('should exclude accounts with include_in_total false from balance', () => {
		const hiddenAccount: Entity = {
			id: 'account-hidden',
			type: 'account',
			name: 'Hidden',
			currency: 'USD',
			row: 0,
			position: 2,
			include_in_total: false,
		};

		const tx1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount_minor: 300000,
			currency: 'USD',
			timestamp: periodStart,
		};

		const tx2: Transaction = {
			id: 'tx-2',
			from_entity_id: 'income-1',
			to_entity_id: 'account-hidden',
			amount_minor: 200000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount, hiddenAccount],
			transactions: [tx1, tx2],
		});

		const { result } = renderHook(() => useSummary());

		// Only account-1 (300000) should count; hidden account excluded.
		expect(result.current.balance).toBe(300000);
	});

	it('should exclude investment accounts from balance', () => {
		const investmentAccount: Entity = {
			id: 'account-investment',
			type: 'account',
			name: 'Brokerage',
			currency: 'USD',
			row: 0,
			position: 2,
			is_investment: true,
		};

		const tx1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount_minor: 300000,
			currency: 'USD',
			timestamp: periodStart,
		};

		const tx2: Transaction = {
			id: 'tx-2',
			from_entity_id: 'income-1',
			to_entity_id: 'account-investment',
			amount_minor: 200000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount, investmentAccount],
			transactions: [tx1, tx2],
		});

		const { result } = renderHook(() => useSummary());

		expect(result.current.balance).toBe(300000);
	});

	it('should not include unplanned categories in remaining', () => {
		const mockCategory2: Entity = {
			id: 'category-2',
			type: 'category',
			name: 'Unplanned',
			currency: 'USD',
			row: 0,
			position: 1,
		};

		const plan1: Plan = {
			id: 'plan-1',
			entity_id: 'category-1',
			period: 'all-time',
			period_start: currentPeriod,
			planned_amount_minor: 50000,
		};

		// Spending on the planned category
		const tx1: Transaction = {
			id: 'tx-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
			currency: 'USD',
			timestamp: periodStart,
		};

		// Spending on the unplanned category — should NOT drag remaining negative
		const tx2: Transaction = {
			id: 'tx-2',
			from_entity_id: 'account-1',
			to_entity_id: 'category-2',
			amount_minor: 30000,
			currency: 'USD',
			timestamp: periodStart + 1000,
		};

		useStore.setState({
			entities: [mockAccount, mockCategory, mockCategory2],
			plans: [plan1],
			transactions: [tx1, tx2],
		});

		const { result } = renderHook(() => useSummary());

		// Remaining: only category-1 counts → 500 - 200 = 300
		expect(result.current.remaining).toBe(30000);
		// Expenses: both categories count → 20000 + 30000 = 50000 minor units.
		expect(result.current.expenses).toBe(50000);
	});

	it('should return zeros when no entities exist', () => {
		const { result } = renderHook(() => useSummary());

		expect(result.current.balance).toBe(0);
		expect(result.current.expenses).toBe(0);
		expect(result.current.remaining).toBe(0);
	});

	it('should include balanceSeed pre-period history in the balance during the phase-2 hydration window (KII-144)', () => {
		// Full-history equivalent: everything as real rows, no seed involved.
		const oldIncomeToAccount: Transaction = {
			id: 'tx-old',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount_minor: 400000,
			currency: 'USD',
			timestamp: periodStart - 30 * 86_400_000,
		};
		const recentIncomeToAccount: Transaction = {
			id: 'tx-recent',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount_minor: 100000,
			currency: 'USD',
			timestamp: periodStart,
		};

		useStore.setState({
			entities: [mockIncome, mockAccount],
			transactions: [oldIncomeToAccount, recentIncomeToAccount],
			balanceSeed: [],
		});
		const { result: full, unmount: unmountFull } = renderHook(() => useSummary());
		const expectedBalance = full.current.balance;
		expect(expectedBalance).toBe(500000);
		unmountFull();

		// Phase-1-style store state: the old row is collapsed into a
		// balanceSeed aggregate and is NOT part of `transactions`.
		useStore.setState({
			entities: [mockIncome, mockAccount],
			transactions: [recentIncomeToAccount],
			balanceSeed: [
				{
					id: '__balance_seed__:income-1:account-1:USD',
					from_entity_id: 'income-1',
					to_entity_id: 'account-1',
					amount_minor: 400000,
					currency: 'USD',
					timestamp: periodStart - 1,
					note: null,
					is_confirmed: true,
				},
			],
		});

		const { result } = renderHook(() => useSummary());

		expect(result.current.balance).toBe(expectedBalance);
	});
});

describe('SummaryHeader (KII-166: currency-threading tripwire)', () => {
	beforeEach(() => {
		useStore.setState({
			entities: [],
			plans: [],
			transactions: [],
			balanceSeed: [],
			currentPeriod: '2026-01',
			isLoading: false,
			draggedEntity: null,
			incomeVisible: false,
		});
	});

	// Every other fixture in this repo is EUR, so a display site that regresses
	// to a hardcoded/wrong currency would still pass every other test. Entity
	// currency is irrelevant here — SummaryHeader formats its three totals with
	// the `currency` prop it's given (app-wide currency), never the entities'
	// own currency — so JPY's zero decimal places is the tripwire: the same
	// minor-unit integers would render with a decimal point under EUR/USD.
	it('renders balance/expenses/planned at JPY (0dp) precision from the currency prop, not 2dp', () => {
		const income: Entity = {
			id: 'income-1',
			type: 'income',
			name: 'Salary',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const account: Entity = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const category: Entity = {
			id: 'category-1',
			type: 'category',
			name: 'Groceries',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const plan: Plan = {
			id: 'plan-1',
			entity_id: 'category-1',
			period: 'all-time',
			period_start: '2026-01',
			planned_amount_minor: 50000,
		};
		const periodStart = new Date('2026-01-01T00:00:00').getTime();
		const incomeToAccount: Transaction = {
			id: 'tx-1',
			from_entity_id: 'income-1',
			to_entity_id: 'account-1',
			amount_minor: 150000,
			currency: 'USD',
			timestamp: periodStart,
		};
		const accountToCategory: Transaction = {
			id: 'tx-2',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 20000,
			currency: 'USD',
			timestamp: periodStart + 1000,
		};

		useStore.setState({
			entities: [income, account, category],
			plans: [plan],
			transactions: [incomeToAccount, accountToCategory],
		});

		// balance = 150000 - 20000 = 130000; expenses = 20000; planned remaining = 50000 - 20000 = 30000
		const { getByText, queryByText } = render(<SummaryHeader currency="JPY" />);

		expect(getByText('130,000')).toBeTruthy();
		expect(getByText('20,000')).toBeTruthy();
		expect(getByText('30,000')).toBeTruthy();

		// Guard: none of these should ever render at 2-decimal precision, which is
		// what the original KII-155 bug (and a future regression) would produce.
		expect(queryByText('1,300.00')).toBeNull();
		expect(queryByText('200.00')).toBeNull();
		expect(queryByText('300.00')).toBeNull();
	});
});
