// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_groovy_lorna_dane.sql';
import m0001 from './0001_add-balance-adjustment.sql';
import m0002 from './0002_row-and-position-for-entities.sql';
import m0003 from './0003_add-include-in-total.sql';
import m0004 from './0004_migrate_plans_to_alltime.sql';
import m0005 from './0005_default-currency-to-eur.sql';
import m0006 from './0006_add-reservations.sql';
import m0007 from './0007_soft-delete-entities.sql';
import m0008 from './0008_nostalgic_peter_parker.sql';
import m0009 from './0009_savings-to-transactions.sql';
import m0010 from './0010_add-default-account.sql';
import m0011 from './0011_steady_red_ghost.sql';
import m0012 from './0012_slim_hex.sql';
import m0013 from './0013_add-notification-id.sql';
import m0014 from './0014_add-investment-mode.sql';

export default {
	journal,
	migrations: {
		m0000,
		m0001,
		m0002,
		m0003,
		m0004,
		m0005,
		m0006,
		m0007,
		m0008,
		m0009,
		m0010,
		m0011,
		m0012,
		m0013,
		m0014,
	},
};
