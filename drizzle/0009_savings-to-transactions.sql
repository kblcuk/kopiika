-- Reverse migration 0006: convert reservations back to account→saving transactions.
-- Each reservation becomes a single transaction with the total reserved amount.

INSERT INTO `transactions` (`id`, `from_entity_id`, `to_entity_id`, `amount`, `currency`, `timestamp`)
SELECT
    'migrated-res-' || `account_entity_id` || '-' || `saving_entity_id`,
    `account_entity_id`,
    `saving_entity_id`,
    `amount`,
    (SELECT `currency` FROM `entities` WHERE `id` = r.`account_entity_id`),
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `reservations` r
WHERE `amount` > 0;

-- Drop reservation indexes and table.
DROP INDEX IF EXISTS `idx_reservations_account`;
DROP INDEX IF EXISTS `idx_reservations_saving`;
DROP INDEX IF EXISTS `unq_reservations_pair`;
DROP TABLE IF EXISTS `reservations`;
