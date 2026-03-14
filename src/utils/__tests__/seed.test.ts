import { createDefaultEntities, createDefaultPlans } from '../seed';
import { getCurrentPeriod } from '@/src/types';

describe('seed helpers', () => {
	test('createDefaultPlans uses all-time semantics for a fresh app setup', () => {
		const entities = createDefaultEntities();
		const plans = createDefaultPlans(entities);

		expect(plans).toHaveLength(entities.length);
		expect(plans.every((plan) => plan.period === 'all-time')).toBe(true);
		expect(plans.every((plan) => plan.period_start === getCurrentPeriod())).toBe(true);
	});
});
