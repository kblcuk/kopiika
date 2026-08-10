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
import m0015 from './0015_market_value_snapshots_fk.sql';
import m0016 from './0016_unique_plan_per_entity_period.sql';
import m0017 from './0017_cleanup_market_value_snapshot_orphans.sql';
import m0018 from './0018_add_updated_at.sql';
import m0019 from './0019_recurrence_exclusions_table.sql';
import m0020 from './0020_money_to_minor_units.sql';
import m0021 from './0021_cleanup_legacy_future_occurrences.sql';
import m0022 from './0022_drop-unused-columns.sql';
import m0023 from './0023_add-split-id.sql';
import m0024 from './0024_backfill-split-id.sql';

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
		m0015,
		m0016,
		m0017,
		m0018,
		m0019,
		m0020,
		m0021,
		m0022,
		m0023,
		m0024,
	},
};
