-- Switch default currency from UAH to EUR.
-- No monetary value conversion — only the currency label changes.

UPDATE entities SET currency = 'EUR' WHERE currency = 'UAH';
--> statement-breakpoint
UPDATE transactions SET currency = 'EUR' WHERE currency = 'UAH';

