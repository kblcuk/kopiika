import journal from './meta/_journal.json';
import m0000 from './0000_groovy_lorna_dane.sql';
import m0001 from './0001_add-balance-adjustment.sql';
import m0002 from './0002_row-and-position-for-entities.sql';
import m0003 from './0003_add-include-in-total.sql';
import m0004 from './0004_migrate_plans_to_alltime.sql';
import m0005 from './0005_default-currency-to-eur.sql';

export default {
	journal,
	migrations: {
		m0000,
		m0001,
		m0002,
		m0003,
		m0004,
		m0005,
	},
};
