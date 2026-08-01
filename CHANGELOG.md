# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.3.28](https://codeberg.org/kblcuk/kopiika/compare/v0.3.26...v0.3.28) (2026-08-01)


### Bug Fixes

* **recurrence:** dedup derived occurrences by slot, not current date (KII-157) ([6a69d14](https://codeberg.org/kblcuk/kopiika/commit/6a69d14edd20c852b27040cecdc1d8168c948df9))
* **recurrence:** don't re-ask for series scope when deleting (KII-158) ([774f553](https://codeberg.org/kblcuk/kopiika/commit/774f553c4cda7e554ed4e780a1060c253e48eb18))
* **settings:** Wipe data through the bulk-delete path on reset ([7037dd9](https://codeberg.org/kblcuk/kopiika/commit/7037dd9ee4f3b0e550cc400e22910646640f3e60))

## [0.3.26](https://codeberg.org/kblcuk/kopiika/compare/v0.3.24...v0.3.26) (2026-07-31)


### Features

* **home:** add bubble tap flow resolver (KII-154) ([f5d6415](https://codeberg.org/kblcuk/kopiika/commit/f5d64159827c9ff610da782e747983eed1b954c5))
* **home:** add long-press armer for held-in-place bubble gestures (KII-154) ([ef2381b](https://codeberg.org/kblcuk/kopiika/commit/ef2381bae9e893584f7430f15c33ed9bc7c7f053))
* **home:** add openQuickAdd to the transaction flow hook (KII-154) ([61e1a6d](https://codeberg.org/kblcuk/kopiika/commit/61e1a6d6e61ca0c8e1269a70dafe796af18030af))
* **home:** detect held-in-place bubble long-press in the grid (KII-154) ([2fa355c](https://codeberg.org/kblcuk/kopiika/commit/2fa355c6a2f1357b83418a036045120e531f3f5b))
* **home:** lead the empty-board nudge with the tap path (KII-154) ([3ffba34](https://codeberg.org/kblcuk/kopiika/commit/3ffba34634058a73d2f7dcb785b3c54ac611a4b5))
* **home:** open quick-add on bubble tap, history on long-press (KII-154) ([d46d8de](https://codeberg.org/kblcuk/kopiika/commit/d46d8dec31549257550c8b96c13fc981a55e8eb6))
* **import:** accept datetime values in date columns (Revolut etc.) ([348a147](https://codeberg.org/kblcuk/kopiika/commit/348a14778b1f7a91530fc1930190dc0b322c6e25))
* **import:** bank-import format primitives + types ([4547841](https://codeberg.org/kblcuk/kopiika/commit/454784116388b1ceec8a0d5b821b733595e5e1dc))
* **import:** build transactions from reconciled assignments ([2b4d8e4](https://codeberg.org/kblcuk/kopiika/commit/2b4d8e48011aed842dfb71f29f5f2653c4062ec0))
* **import:** column-mapping step with live preview ([9726a8b](https://codeberg.org/kblcuk/kopiika/commit/9726a8b39e0dccef30e8196a5a69f2a2b7d100da))
* **import:** CSV column auto-detection ([adfe6f1](https://codeberg.org/kblcuk/kopiika/commit/adfe6f1250e299ee11d5e05c0501e24cfc09b44e))
* **import:** drop description header-hint guessing; keep manual column selector ([50f4059](https://codeberg.org/kblcuk/kopiika/commit/50f4059119f0eaf93241415063059bc6af82aecc))
* **import:** import wizard route + History entry point + file pick ([49ef971](https://codeberg.org/kblcuk/kopiika/commit/49ef971d20b2b62afc456ddc60e17b9355345589))
* **import:** parse bank rows into signed minor-unit rows ([f2e45ca](https://codeberg.org/kblcuk/kopiika/commit/f2e45ca64ff8504eb2076f5450faac366e560714))
* **import:** propagate category to same-description rows; select-all; perf; drop confusing bulk mode ([e66ecf7](https://codeberg.org/kblcuk/kopiika/commit/e66ecf7e8128d868b898948700bdaf124e52c564))
* **import:** reconcile rows against existing account txns (greedy 1:1) ([a71211c](https://codeberg.org/kblcuk/kopiika/commit/a71211c2e4b7e5959b4450443c4aa04d211d7855))
* **import:** reconcile statement lines against split transactions ([4979914](https://codeberg.org/kblcuk/kopiika/commit/4979914705c1d0c25f3a6ce87b7f53a0d11a5d1e))
* **import:** reuse category modal, importable duplicates, row cues ([edf0633](https://codeberg.org/kblcuk/kopiika/commit/edf063323eace442e2f42b0d2880c0b3d6206af1))
* **import:** review/categorize step + atomic commit ([39bdd5f](https://codeberg.org/kblcuk/kopiika/commit/39bdd5fedc5afba65f4a07ae8601c1190309b3cc))
* **import:** smarter description-column default + selector in mapping step ([5ec6eae](https://codeberg.org/kblcuk/kopiika/commit/5ec6eae2d4d918a5654bb989f95e1655d23f9d8e))


### Bug Fixes

* **e2e:** guard cancel tap and wait on deferred filter label (KII-154) ([7c1d899](https://codeberg.org/kblcuk/kopiika/commit/7c1d899c0e138719921bb577a022b98c40517ca5))
* **import:** decode non-UTF-8 bank statements instead of failing ([c4a0f41](https://codeberg.org/kblcuk/kopiika/commit/c4a0f41e0643ce2cdac754adc96c99a64ad45550))
* **import:** detect-columns money-safety + header/amount heuristics (task 3 review) ([992e2d0](https://codeberg.org/kblcuk/kopiika/commit/992e2d0398aa38194b73c70a1c697ae29e3750b7))
* **import:** parse-rows debit/credit skip reasons + ambiguity guard (task 4 review) ([660215e](https://codeberg.org/kblcuk/kopiika/commit/660215eea0c10fe690e1eadc3b58eb373179f5f8))
* **import:** prefer strong signed amount over coincidental debit/credit hints (task 3 review) ([a648363](https://codeberg.org/kblcuk/kopiika/commit/a6483630a3b0470f97f2b28973a9b454807fbcf0))
* **import:** satisfy noUncheckedIndexedAccess across bank-import + narrow AmountMapping ([6f6894d](https://codeberg.org/kblcuk/kopiika/commit/6f6894d24c78b9e5b3ae629ae2f0d62f9b45e224))
* **import:** wire transfer suggestion, currency-filter pickers, count + confidence polish (final review) ([7267fe6](https://codeberg.org/kblcuk/kopiika/commit/7267fe6a07c6dbdda096ddce2100b5b34f78c9aa))
* **store:** dedup recurrence backfill by deterministic id, not just civil date ([76145b3](https://codeberg.org/kblcuk/kopiika/commit/76145b35a067b5464c135fa5520816ba7aaf8799))
* **store:** key recurrence dedup and exclusion off the slot id, not the timestamp ([1ff14be](https://codeberg.org/kblcuk/kopiika/commit/1ff14beec6975a9198bed4e9c85ba8fc7a5c1b27))

## [0.3.25](https://codeberg.org/kblcuk/kopiika/compare/v0.3.24...v0.3.25) (2026-07-19)


### Bug Fixes

* **store:** dedup recurrence backfill by deterministic id, not just civil date ([74cbc17](https://codeberg.org/kblcuk/kopiika/commit/74cbc17ce4257a9382287cde10d96122fc8fed77))
* **store:** key recurrence dedup and exclusion off the slot id, not the timestamp ([b2912dc](https://codeberg.org/kblcuk/kopiika/commit/b2912dc3572ab34ae985d92824cc2076bb4139ab))

## [0.3.24](https://codeberg.org/kblcuk/kopiika/compare/v0.3.23...v0.3.24) (2026-07-14)


### Features

* **home:** add EntitySectionSkeleton placeholder (KII-144) ([603892d](https://codeberg.org/kblcuk/kopiika/commit/603892d5ee4c8133c81638b6c9f810252a555ad0))
* **home:** add useHasOpened latch for deferred modal mount (KII-144) ([fbdb6ed](https://codeberg.org/kblcuk/kopiika/commit/fbdb6ed3ba91e6bdf2b3c50b43bb92fc6ccfd1ec))
* **home:** add useStaggeredReveal for one-per-frame section mount (KII-144) ([4440066](https://codeberg.org/kblcuk/kopiika/commit/444006695931f9ef9abe7a66279be7d69e793c72))
* **startup:** themed loading gate; load fonts in parallel with DB (KII-144) ([f48cbff](https://codeberg.org/kblcuk/kopiika/commit/f48cbff49c0b036cf31602c63e9a69c2b3d3459d))
* **sync:** handle entity.{create,update,delete} in applyOperation (KII-134) ([1e9fe99](https://codeberg.org/kblcuk/kopiika/commit/1e9fe9932a63295b4b3a55f68b80c7369f378c86))
* **sync:** handle import.replace_all in applyOperation (KII-134) ([9f40893](https://codeberg.org/kblcuk/kopiika/commit/9f40893021e85e42e61290f6416e3fc966fa6173))
* **sync:** handle market_value ops in applyOperation (KII-134) ([83caddd](https://codeberg.org/kblcuk/kopiika/commit/83caddd5032231e1f206931910b639fb62cdb737))
* **sync:** handle plan.{set,delete} in applyOperation (KII-134) ([890812e](https://codeberg.org/kblcuk/kopiika/commit/890812e532dd8946206ae1f8911122fe316b41c9))
* **sync:** handle recurrence.create; route backfill through transaction.batch_create (KII-134) ([abeeabb](https://codeberg.org/kblcuk/kopiika/commit/abeeabbeb038aa1ba44b6c807cbb813e1d4f6517))
* **sync:** handle recurrence.deactivate in applyOperation (KII-134) ([bc6de6b](https://codeberg.org/kblcuk/kopiika/commit/bc6de6b421d2b14d7ceee3e18a3a5b704344ace8))
* **sync:** handle recurrence.delete_future; route single-scope delete through transaction.delete (KII-134) ([ba250db](https://codeberg.org/kblcuk/kopiika/commit/ba250dbfa38ff8704724e6f99baeef7e566d373b))
* **sync:** handle recurrence.exclude; route materializeOccurrence through transaction.create (KII-134) ([d5d0519](https://codeberg.org/kblcuk/kopiika/commit/d5d05195400bf6739b8ae05d43d0164c80c9507f))
* **sync:** handle recurrence.update_future in applyOperation (KII-134) ([0e46c69](https://codeberg.org/kblcuk/kopiika/commit/0e46c6963af5a9250062efb37bdd8aafe758066e))
* **sync:** handle reservation.set in applyOperation (KII-134) ([8f7106b](https://codeberg.org/kblcuk/kopiika/commit/8f7106b0268dcc53a347276877b658f7ee86b684))
* **sync:** handle transaction.confirm in applyOperation (KII-134) ([a505c94](https://codeberg.org/kblcuk/kopiika/commit/a505c94fc332c39931b2d0a38c522e240dac289c))
* **sync:** handle transaction.split in applyOperation (KII-134) ([9e7cea8](https://codeberg.org/kblcuk/kopiika/commit/9e7cea8f3764aad1d749586957037ff55df2ef37))


### Bug Fixes

* **dnd:** Remeasure drop zones on drag start ([90180aa](https://codeberg.org/kblcuk/kopiika/commit/90180aa5f5ddc657b0c3da6f3294cb14344e7894))
* **history:** Match amount search across dot and comma separators ([57c60c6](https://codeberg.org/kblcuk/kopiika/commit/57c60c68f0dc6d24133b8a95337742453a9b0da3))
* **history:** Set removeClippedSubviews explicitly false on the list ([9be8429](https://codeberg.org/kblcuk/kopiika/commit/9be8429a54bee8ee67b1a4af1edfbf945020f33b))
* **home:** don't bind useScrollOffset to unmounted deferred sections (KII-144) ([c151d14](https://codeberg.org/kblcuk/kopiika/commit/c151d1466858cf88ee2a3e19023a4356105b7181))
* **home:** reserve full section height in skeleton; harden reveal/modal tests (KII-144) ([c7296d1](https://codeberg.org/kblcuk/kopiika/commit/c7296d14184a88cd445a4381849b41797d324cf9))
* **startup:** paper-tone navigation theme to kill white cold-start flash (KII-144) ([3402124](https://codeberg.org/kblcuk/kopiika/commit/340212467dd97033d88e7837189dbe198d787f8f))
* **store:** guard balance loop against self-referential transfer rows (KII-124) ([d048980](https://codeberg.org/kblcuk/kopiika/commit/d048980ccaf0c6ec0840cc3dac7634b5dd3c9b6f))

## [0.3.23](https://codeberg.org/kblcuk/kopiika/compare/v0.3.22...v0.3.23) (2026-06-27)


### Bug Fixes

* **import:** clear dangling series_id to stop orphaning recurring rows ([7421146](https://codeberg.org/kblcuk/kopiika/commit/7421146a7acab337bc0edba82b50ac0024838beb))
* **recurrence:** complete orphaned-occurrence handling across edit and import ([cd4b8aa](https://codeberg.org/kblcuk/kopiika/commit/cd4b8aa73a0c87dfc78305b197f67a819f396771))
* **recurrence:** let delete/split tolerate a missing series template ([b49d793](https://codeberg.org/kblcuk/kopiika/commit/b49d79394f06aeaf8c37dc836925c8e19c807e90))
* **tests:** remove some of the unneeded any castings ([e4a2c1e](https://codeberg.org/kblcuk/kopiika/commit/e4a2c1ed91566fdd4b94fd6770529e21ab43a175))

## [0.3.22](https://codeberg.org/kblcuk/kopiika/compare/v0.3.21...v0.3.22) (2026-06-25)


### Features

* **builder:** allow explicit transaction id for deterministic occurrence ids (KII-136) ([65d61f6](https://codeberg.org/kblcuk/kopiika/commit/65d61f65aedf0d2c14740b9a1dbcd1ce9e01ca8b))
* **recurrence:** add civil-date identity helpers (KII-136) ([7ced4eb](https://codeberg.org/kblcuk/kopiika/commit/7ced4eb7082dd1decc656ff84e1f019323789be9))
* **recurrence:** add deriveVirtualOccurrences selector (KII-136) ([bd3712a](https://codeberg.org/kblcuk/kopiika/commit/bd3712a1fd32b1a4c39e369de73350ac7309a6c0))
* **recurrence:** addRecurringTransaction creates template only, no future rows (KII-136) ([3b8f410](https://codeberg.org/kblcuk/kopiika/commit/3b8f41079900a35d4c847dba03aa7eab6df5a978))
* **recurrence:** clean up legacy materialized future occurrences on launch (KII-136) ([263534c](https://codeberg.org/kblcuk/kopiika/commit/263534c8469b43f1e596d1b78a3e9f2a61213580))
* **recurrence:** derive upcoming occurrences into entity balances (KII-136) ([2b84606](https://codeberg.org/kblcuk/kopiika/commit/2b84606e0d650d07edff2383de18abc011560674))
* **recurrence:** derive upcoming occurrences into history screen (KII-136) ([146719e](https://codeberg.org/kblcuk/kopiika/commit/146719e877985b83bc8b194c0a5f55954708fd37))
* **recurrence:** match exclusions by civil date (KII-136) ([0312ff5](https://codeberg.org/kblcuk/kopiika/commit/0312ff56611d979398124190c4055f518d2a0680))
* **recurrence:** materialize only past-due occurrences (KII-136) ([7a0c2ec](https://codeberg.org/kblcuk/kopiika/commit/7a0c2ecfe50486fd937cca8974d1abdaa16bb943))
* **recurrence:** materialize virtual occurrence on edit/delete/confirm (KII-136) ([b5f9ca5](https://codeberg.org/kblcuk/kopiika/commit/b5f9ca56796bc8cac02ba3f2ebb91493bf6bef0d))
* **sync:** add applyOperation chokepoint with transaction.create (KII-99) ([7b3343e](https://codeberg.org/kblcuk/kopiika/commit/7b3343e5d455e1350e83768a1682584871cffe1b))
* **sync:** handle transaction.batch_create in applyOperation (KII-99) ([86d2504](https://codeberg.org/kblcuk/kopiika/commit/86d2504f41542fd0a0c73a4e1c4e9ddfd5a028a4))
* **sync:** handle transaction.delete in applyOperation (KII-99) ([4b36b35](https://codeberg.org/kblcuk/kopiika/commit/4b36b352f12a58db393b772c2096dd93dbeef8a2))
* **sync:** handle transaction.update in applyOperation (KII-99) ([583fb76](https://codeberg.org/kblcuk/kopiika/commit/583fb76217575cda95162e337284ee44eb5ad038))
* **types:** add transient isVirtual flag to Transaction (KII-136) ([f7ad8ed](https://codeberg.org/kblcuk/kopiika/commit/f7ad8ed13a91db0f702f8526383a45fa44cef01b))


### Bug Fixes

* **db:** remove redundant await on synchronous drizzle transaction callbacks ([92316eb](https://codeberg.org/kblcuk/kopiika/commit/92316ebe6d479f592a4e43dfdd62b7f048b9e15d))
* enforce no-misused-promises and fix async handler leaks ([cb28260](https://codeberg.org/kblcuk/kopiika/commit/cb2826028824506e9b78706937cc152a746eab93))
* **sync:** require full transaction rows in ApplyContext; drop unsafe cast (KII-99) ([a1fea02](https://codeberg.org/kblcuk/kopiika/commit/a1fea023a2de099a20b81521e3830d26800d744b))

## [0.3.21](https://codeberg.org/kblcuk/kopiika/compare/v0.3.20...v0.3.21) (2026-06-07)

## [0.3.20](https://codeberg.org/kblcuk/kopiika/compare/v0.3.19...v0.3.20) (2026-06-05)


### Features

* **db:** normalize recurrence exclusions into a separate table (KII-123) ([a4c24c7](https://codeberg.org/kblcuk/kopiika/commit/a4c24c7612aa6181cf20048499b04533fe2e425f))


### Bug Fixes

* **history:** sort upcoming transactions farthest first ([4df1971](https://codeberg.org/kblcuk/kopiika/commit/4df197153b1cfe6f3a2e3f5bd3d3d0fd3704368b))

## [0.3.19](https://codeberg.org/kblcuk/kopiika/compare/v0.3.18...v0.3.19) (2026-06-01)


### Features

* **currency:** add Intl-based per-currency decimal precision helper ([8d0f340](https://codeberg.org/kblcuk/kopiika/commit/8d0f340eff49d0dcf4cf46ecca4b066a532cb41e))
* **db:** add created_at + updated_at columns for sync ordering (KII-126) ([dc54e0a](https://codeberg.org/kblcuk/kopiika/commit/dc54e0aa4933c18e9e94934119e2598c17e9b87d))
* **dx:** use hk for pre-commit hooks ([db61f28](https://codeberg.org/kblcuk/kopiika/commit/db61f2851e977f8c487e76b0a3aeeb4b2b2b7288))
* **format:** make formatAmount + formatAmountForInput currency-aware ([ab0ee7c](https://codeberg.org/kblcuk/kopiika/commit/ab0ee7c20285de4a6fb00945bfd58c99db7fd24f))
* **format:** parameterize roundMoney by decimal places ([76f550a](https://codeberg.org/kblcuk/kopiika/commit/76f550a16cdae03c8fae9d578bdc2c0962a88ee8))
* **input:** add sanitizeAmountInput for plain monetary inputs ([92f22a6](https://codeberg.org/kblcuk/kopiika/commit/92f22a6af4dcd3e9018844ce459b53ae6a1fe9b2))
* **input:** add sanitizeExpressionInput for arithmetic expressions ([87b0283](https://codeberg.org/kblcuk/kopiika/commit/87b028339a83dbbe0acc97d47d5660f822ea9eb0))
* **input:** apply sanitizeAmountInput at all amount input sites ([53f721e](https://codeberg.org/kblcuk/kopiika/commit/53f721e6d5d10d352cfc5865a5b6c9cc19e10b28))
* **recurrence:** auto-derive horizon from frequency; remove picker UI ([692da37](https://codeberg.org/kblcuk/kopiika/commit/692da37b34254e6bb7fc6e2c86f0a63fc4789eec))
* **recurrence:** re-backfill horizon on app foreground ([82ea3a6](https://codeberg.org/kblcuk/kopiika/commit/82ea3a69babdc34cf0b65fcd44439caafb6d26d6))
* **store:** round save-path amounts to per-currency precision ([76ac129](https://codeberg.org/kblcuk/kopiika/commit/76ac12966ab81e36a2ee5c5333fe8640de2fdd92))


### Bug Fixes

* **history:** retry scroll against current sections, not stale closure ([04f70a1](https://codeberg.org/kblcuk/kopiika/commit/04f70a169985e6a55e0c3f58db263618d9005c8b))
* **summary:** raise progress-bar contrast and enforce min visible fill ([1787914](https://codeberg.org/kblcuk/kopiika/commit/178791411009d4f14e376070dbf335c1e7a7bc63)), closes [#D4C8B3](https://codeberg.org/kblcuk/kopiika/issues/D4C8B3) [#F8F4](https://codeberg.org/kblcuk/kopiika/issues/F8F4)
* **transaction-modal:** auto-seed end-date / end-count for finite recurrences ([560090f](https://codeberg.org/kblcuk/kopiika/commit/560090f0458ee34f4c1a55c8659a1af527e406c7))
* **transaction-modal:** format split anchor + split row chip via locale-aware helpers ([e742ef2](https://codeberg.org/kblcuk/kopiika/commit/e742ef29ae7f0350c70f897f8da2f4d74aa69f84))
* **transaction-modal:** only forward timestamp when user changed the date ([3ad38bc](https://codeberg.org/kblcuk/kopiika/commit/3ad38bc5b6df860c2dfe2139392b23028ef96809))
* **transaction-modal:** preserve typed separators in split-mode main input ([aaff083](https://codeberg.org/kblcuk/kopiika/commit/aaff083901acf9eb4002eb9ed32a5a1b47bb1dee))

## [0.3.18](https://codeberg.org/kblcuk/kopiika/compare/v0.3.17...v0.3.18) (2026-05-24)


### Features

* **ci:** renovate ([b40f32c](https://codeberg.org/kblcuk/kopiika/commit/b40f32c2370f6fe113735d3ff83c8830b600c7b4))
* **db:** add replaceTransactionAtomic for split-of-existing (KII-110) ([e079108](https://codeberg.org/kblcuk/kopiika/commit/e079108a834072b79c3d0170ad21b83245ee8cda))
* **modal:** wire Split toggle into edit mode (KII-110) ([d98b615](https://codeberg.org/kblcuk/kopiika/commit/d98b615b26985d9e42aeadb3151580e62056c8e8))
* **store:** replaceTransactionWithSplit action (KII-110) ([29bd370](https://codeberg.org/kblcuk/kopiika/commit/29bd3702b13b5296943f92426e444d6cc6f9119c))


### Bug Fixes

* **db:** rollback replaceTransactionAtomic when series template missing (KII-110) ([023c992](https://codeberg.org/kblcuk/kopiika/commit/023c992611716c32b5b69ed2d1cfe1f515cefda7))
* **db:** wrap updateEntityPositions in a transaction (KII-119) ([2d4e184](https://codeberg.org/kblcuk/kopiika/commit/2d4e184792f42422debc9970a0d983664eaf2adb))
* **history:** reset filter on tab-bar focus via one-shot nav signal (KII-111) ([7791bb7](https://codeberg.org/kblcuk/kopiika/commit/7791bb7baba14910be65c1b3e07bcb1aa0f68f41))
* **import:** default is_confirmed by timestamp when CSV column missing (KII-118) ([f0e9c04](https://codeberg.org/kblcuk/kopiika/commit/f0e9c04d6e4f5bab77184a68a5d9fd31a0377dc4))
* pass github token for renovate job ([5692f1e](https://codeberg.org/kblcuk/kopiika/commit/5692f1e4f88f5e3e2d1f75dbefad4d639872f0b9))
* **store:** make setDefaultAccount atomic (KII-113) ([0300d83](https://codeberg.org/kblcuk/kopiika/commit/0300d8330dc0951f80587901bbf8282960ae4e83))
* **store:** strip series_id from split children + empty-rows guard test (KII-110) ([b0bb171](https://codeberg.org/kblcuk/kopiika/commit/b0bb171b0729d8a1578305ea5ce5a95526690b64))
* **theme:** replace non-existent paper-400 with paper-300 (KII-128) ([276cec3](https://codeberg.org/kblcuk/kopiika/commit/276cec3c6b910424467b04c580ca26dac2bb6f91))

## [0.3.17](https://codeberg.org/kblcuk/kopiika/compare/v0.3.16...v0.3.17) (2026-05-18)


### Bug Fixes

* **async-handlers:** surface silent failures in async onPress/onValueChange (KII-127) ([bc17408](https://codeberg.org/kblcuk/kopiika/commit/bc17408de79e9749042f9ad07f971e95d9a85b9f))
* **db:** await db.transaction() calls + regression test (KII-115) ([6e2fc68](https://codeberg.org/kblcuk/kopiika/commit/6e2fc6858fe7db5fdd5f0dbb9dba57172b114305))
* **db:** enforce foreign_keys PRAGMA on native + clean snapshot orphans (KII-122) ([de38fad](https://codeberg.org/kblcuk/kopiika/commit/de38fad66d62481e6ae5cbe5afe4e0e265d5b2ca))
* **import:** enforce domain validation on CSV import (KII-117) ([c134fef](https://codeberg.org/kblcuk/kopiika/commit/c134fefd5211c1da048f1203ccaeeefe6755780c))

## [0.3.16](https://codeberg.org/kblcuk/kopiika/compare/v0.3.15...v0.3.16) (2026-05-18)


### Features

* **csv:** export recurrence_templates section ([673358b](https://codeberg.org/kblcuk/kopiika/commit/673358bad74a8ab4b4d8c0c2cdf01419ef2547f2))
* **csv:** parse recurrence_templates section on import ([1a1ab56](https://codeberg.org/kblcuk/kopiika/commit/1a1ab560c4638a40416c95fca4ffdd8866bd55b1))
* **import:** persist recurrence_templates through replaceAllData ([79c453a](https://codeberg.org/kblcuk/kopiika/commit/79c453aeb73230da48df1c36e750bd7ba4c62dbb))
* **import:** Surface unknown-FK rows as droppable instead of fatal ([159b701](https://codeberg.org/kblcuk/kopiika/commit/159b7018328800080439d6414d951697b5bb27c1))
* **settings:** prompt before importing with droppable items ([876a1dd](https://codeberg.org/kblcuk/kopiika/commit/876a1dd34b5923b371e95b59e487b71d1db7974e))
* **store:** add atomic createTransactionBatch action (KII-116) ([6a24e51](https://codeberg.org/kblcuk/kopiika/commit/6a24e51c1ec1d83380d968dd585e1996645365ee))


### Bug Fixes

* **csv:** round-trip entities.is_default through export and import ([91a410d](https://codeberg.org/kblcuk/kopiika/commit/91a410dc56fbd2722364b7c7613061656fabd131))
* **db:** Conflict plan upserts on (entity_id, period_start) ([efb0b6e](https://codeberg.org/kblcuk/kopiika/commit/efb0b6e628b9a699ffb9272d0a745d5c4a7b4947))
* **e2e:** Unblock Android DnD suite on Pixel9 ([63cc40f](https://codeberg.org/kblcuk/kopiika/commit/63cc40f96d486a62092ccb35c51b6adf4cbd6fd5))
* **e2e:** Update store from seedFixture so home reflects seeded transactions ([259d4e1](https://codeberg.org/kblcuk/kopiika/commit/259d4e1c7d95195c5cb611f9ed8ac891d134366d))
* **import:** align transaction.series_id parse with drizzle (null, not undefined) ([2f0ad29](https://codeberg.org/kblcuk/kopiika/commit/2f0ad299861c9f2bd52d589ed36447ba17933c3b))
* **transactions:** KII-116 commit split + release rows atomically ([6258ed9](https://codeberg.org/kblcuk/kopiika/commit/6258ed99e0a2f86ce6b91867dbacf287e2999610))

## [0.3.15](https://codeberg.org/kblcuk/kopiika/compare/v0.3.14...v0.3.15) (2026-05-16)


### Features

* **app-prefs:** Add onboarding + nudge dismissal keys ([3ff8c9d](https://codeberg.org/kblcuk/kopiika/commit/3ff8c9db5932c7658cd9c9e013983bb2bebd0fcd))
* **help:** add article detail screen with related links ([7f05d61](https://codeberg.org/kblcuk/kopiika/commit/7f05d6101dc41466ff9a6e61861bf36f5678e545))
* **help:** Add help article list screen ([b227645](https://codeberg.org/kblcuk/kopiika/commit/b22764512d65e46aa9b50acd4b42e8d22e3dfe0f))
* **home:** Add dismissable empty-board nudge ([748922d](https://codeberg.org/kblcuk/kopiika/commit/748922d7f7595bee7a66a8a9a118cb8f9fa0865e))
* **info-pin:** add contextual help icon ([582f1bc](https://codeberg.org/kblcuk/kopiika/commit/582f1bc7378d974d6c1bd693da6662d597c6793f))
* **info-pin:** wire contextual help into 6 anchors across 4 modals ([b4387a9](https://codeberg.org/kblcuk/kopiika/commit/b4387a9882a0ad8edf9e8aa0cef3e10a2eafc0a8))
* **kb:** add 9-article knowledge-base registry ([69ec392](https://codeberg.org/kblcuk/kopiika/commit/69ec3924c7fa974de00ba9c042ac7450827fe01a))
* **onboarding:** add bulk-setup chip picker ([1a651a2](https://codeberg.org/kblcuk/kopiika/commit/1a651a2e804996c2015ce9699f7f66059b990d91))
* **onboarding:** add welcome screen + stack layout ([cbc7ffc](https://codeberg.org/kblcuk/kopiika/commit/cbc7ffc15cd12f8c7fbfb4f84d1be44f3102582e))
* **onboarding:** migrate existing users + drop silent preseed ([61b8a85](https://codeberg.org/kblcuk/kopiika/commit/61b8a8568f75992f21a893ffed3aeceb4603b7c6))
* **onboarding:** redirect fresh installs into /onboarding/welcome ([d97428f](https://codeberg.org/kblcuk/kopiika/commit/d97428fdc35d5df481c1fb4cc5690966ba839c7b))
* **onboarding:** stage custom entities until Continue ([755ed93](https://codeberg.org/kblcuk/kopiika/commit/755ed935a3f3419db08a9cece8effa6c02f12299))
* **settings:** add Help row linking to /help ([e402b83](https://codeberg.org/kblcuk/kopiika/commit/e402b83244b77212553d877f5d081d09ae051fa9))
* **settings:** add Take the tour row ([a52221d](https://codeberg.org/kblcuk/kopiika/commit/a52221d3e79efa0ca66b8804f25084a0f7ad5c6b))


### Bug Fixes

* **onboarding:** freeze gate decision after first hydration ([8eab5b1](https://codeberg.org/kblcuk/kopiika/commit/8eab5b1e9e56167d9800cd29e4a833cda9be4359))

## [0.3.14](https://codeberg.org/kblcuk/kopiika/compare/v0.3.13...v0.3.14) (2026-05-13)


### Features

* **colors:** Add curated pie-chart palette with hash-based slice assignment ([f07cbf3](https://codeberg.org/kblcuk/kopiika/commit/f07cbf3934858d5bb9babc6f2cc2372c432f72bb))
* **entity-detail:** Use curated palette for reservation pie chart ([7bf9166](https://codeberg.org/kblcuk/kopiika/commit/7bf916672f1272200e5e77ba78a80d9d12f79a8e))
* **summary:** Use curated palette for category pie chart slices ([53a5189](https://codeberg.org/kblcuk/kopiika/commit/53a5189d396bc0198b8a0158488db0f602d8f5fa))


### Bug Fixes

* **history:** Prevent edit dialog when confirming recurring tx ([b09e99d](https://codeberg.org/kblcuk/kopiika/commit/b09e99db386f8cbbc91533c017fcd47f1e321d09))

## [0.3.13](https://codeberg.org/kblcuk/kopiika/compare/v0.3.11...v0.3.13) (2026-05-10)


### Features

* **history:** Auto-scroll past Upcoming on initial render ([92eb600](https://codeberg.org/kblcuk/kopiika/commit/92eb600befa3674ef01cd511b4b757646b2736a9))


### Bug Fixes

* **colors:** Retune entity palette for perceptual distinctness ([16631f7](https://codeberg.org/kblcuk/kopiika/commit/16631f7d38106e666885c71cb2a210901cb39776))

## [0.3.12](https://codeberg.org/kblcuk/kopiika/compare/v0.3.11...v0.3.12) (2026-05-08)

## [0.3.11](https://codeberg.org/kblcuk/kopiika/compare/v0.3.10...v0.3.11) (2026-05-08)


### Bug Fixes

* **dnd:** Scroll the section under the finger during drag (KII-97) ([e4661e6](https://codeberg.org/kblcuk/kopiika/commit/e4661e68c6244d352f2cf7c08ea645c7d940f51d))

## [0.3.10](https://codeberg.org/kblcuk/kopiika/compare/v0.3.9...v0.3.10) (2026-05-01)


### Features

* **statistics:** Add allocation pie charts ([13c7eca](https://codeberg.org/kblcuk/kopiika/commit/13c7eca1e7abff07d916d0a99c98f52e6a5fae87))

## [0.3.9](https://codeberg.org/kblcuk/kopiika/compare/v0.3.8...v0.3.9) (2026-04-30)


### Features

* **history:** Show reservation summary for entity filters ([f2ee45a](https://codeberg.org/kblcuk/kopiika/commit/f2ee45a393fc12eef46a5ad58c31f9603e6bd72d))
* **ui:** Expose raw balance via accessibilityLabel ([91bc7b8](https://codeberg.org/kblcuk/kopiika/commit/91bc7b84fe2e603991c5460f27e8cc6946cdfdb7))


### Bug Fixes

* consistently use numeric pad for currency inputs ([9a4a0c1](https://codeberg.org/kblcuk/kopiika/commit/9a4a0c17804fefef6c4582f415f80e6b43628a94))
* **transaction-modal:** Prevent double-submit and surface save errors ([80941a3](https://codeberg.org/kblcuk/kopiika/commit/80941a3e9d451549eabff1ce526cf4b4756ec59c))

## [0.3.8](https://codeberg.org/kblcuk/kopiika/compare/v0.3.7...v0.3.8) (2026-04-26)


### Features

* show entities actuals during transaction ([f1b40ac](https://codeberg.org/kblcuk/kopiika/commit/f1b40acbc06ecc8074e731e5e3f34cf9fa2bc202))

## [0.3.7](https://codeberg.org/kblcuk/kopiika/compare/v0.3.6...v0.3.7) (2026-04-25)


### Features

* use same background color as selected color ([55c4735](https://codeberg.org/kblcuk/kopiika/commit/55c47355b5173d12f5a2c60c9e74067fbc3d715d))

## [0.3.6](https://codeberg.org/kblcuk/kopiika/compare/v0.3.5...v0.3.6) (2026-04-25)


### Features

* **accounts:** Add investment account data model ([498930b](https://codeberg.org/kblcuk/kopiika/commit/498930bfc8ddced9ad1239e98486f4da7da0fbf9))
* **accounts:** Add investment account editing UI ([8b8c854](https://codeberg.org/kblcuk/kopiika/commit/8b8c854e867c4a5ca128f592ea101ed732077539))
* **accounts:** Export and import investment account data ([279993d](https://codeberg.org/kblcuk/kopiika/commit/279993de81c3902ee54f44d5cc06532bd71f3bf9))


### Bug Fixes

* **build:** Apply background-task config in clean prebuilds ([2b43735](https://codeberg.org/kblcuk/kopiika/commit/2b437351354967504e63aa2578b09a3ee5cf4a56))
* **notifications:** Defer reminder startup registration ([2a3e11a](https://codeberg.org/kblcuk/kopiika/commit/2a3e11aa7225bbd4f32b748109c62508b42e9e28))
* **release:** Allow beta hotfix builds on same version ([a2db4d6](https://codeberg.org/kblcuk/kopiika/commit/a2db4d69e8472120794b2fe03c31f648e3cc8f37))
* **startup:** Replace InteractionManager and stabilize tests ([3fd7d75](https://codeberg.org/kblcuk/kopiika/commit/3fd7d753c5a708a657975d25013f26f8b1161f66))

## [0.3.5](https://codeberg.org/kblcuk/kopiika/compare/v0.3.4...v0.3.5) (2026-04-22)


### Features

* **db:** Track notification ids on transactions ([b27074e](https://codeberg.org/kblcuk/kopiika/commit/b27074ed2c8468e630e7061054c4b95174036aa1))
* **e2e:** add detox e2e tests for transaction flows ([a7adfeb](https://codeberg.org/kblcuk/kopiika/commit/a7adfeb861a42875784adfcb3b357ca2aaaaca16))
* **e2e:** expand detox tests with fixture seeding, DnD, and refund flows ([395dab9](https://codeberg.org/kblcuk/kopiika/commit/395dab9ebf8e0fac5a74051e2235a3c19fd55d2f))
* **entities:** Add EntityColorKey type and color palette constant (KII-81) ([ebdd3dd](https://codeberg.org/kblcuk/kopiika/commit/ebdd3dd8afbf6b4342599f979db4013d7779de40))
* **entities:** Add EntityColorPicker component (KII-81) ([e438863](https://codeberg.org/kblcuk/kopiika/commit/e4388635d6d6701509e67d9d55672be1e3afcc2b))
* **entities:** integrate color picker into create modal (KII-81) ([e48a0a8](https://codeberg.org/kblcuk/kopiika/commit/e48a0a841e0684d979a3d479a7f7811f9c003307))
* **entities:** integrate color picker into edit modal (KII-81) ([5278445](https://codeberg.org/kblcuk/kopiika/commit/52784457c0ab6d1ac40a86d73e5b80612fc18924))
* **history:** Add unconfirmed transaction badge on History tab (KII-90) ([249524f](https://codeberg.org/kblcuk/kopiika/commit/249524f3f495994a4b1f3f4e6c7b90346c322869))
* **notifications:** Schedule and manage local reminders ([df5ffd7](https://codeberg.org/kblcuk/kopiika/commit/df5ffd7bca54914aa04c7f78b196e6840d2677df))
* **settings:** Add reminder controls and catch-up task ([ea0f732](https://codeberg.org/kblcuk/kopiika/commit/ea0f7322cdc5ace869ca1a962e79ea8b51274d8f))


### Bug Fixes

* **entities:** deduplicate ColorPair type and fix dot layout shift (KII-81) ([e668afb](https://codeberg.org/kblcuk/kopiika/commit/e668afbef556a1c332255de4f14d128a9e82dbf4))
* **notifications:** Reset reminder state across toggle flows ([5dfc019](https://codeberg.org/kblcuk/kopiika/commit/5dfc019118ecde04fa0a5c375b318a41f509a8cc))

## [0.3.4](https://codeberg.org/kblcuk/kopiika/compare/v0.3.3...v0.3.4) (2026-04-21)


### Features

* **transactions:** Add explicit delete button in edit modal (KII-84) ([0423cb7](https://codeberg.org/kblcuk/kopiika/commit/0423cb78e747fe9c83deb92b174c57f598763e2f))
* **transactions:** Auto-confirm today's occurrence in recurring series (KII-92) ([be9fee5](https://codeberg.org/kblcuk/kopiika/commit/be9fee56bbb8e9262b0feab09261a5901abaf961))
* **transactions:** Show validation hint for invalid amount ([0bbd289](https://codeberg.org/kblcuk/kopiika/commit/0bbd2896ab7d8b6004f8eeb854815b6946ba0e74))


### Bug Fixes

* move "fund from savings" below date & note ([41e57be](https://codeberg.org/kblcuk/kopiika/commit/41e57be175970907a430c320313d60cd3da33bf2))

## [0.3.3](https://codeberg.org/kblcuk/kopiika/compare/v0.3.2...v0.3.3) (2026-04-20)


### Features

* add transaction confirmation for future-dated and recurring transactions (KII-65) ([52dd98f](https://codeberg.org/kblcuk/kopiika/commit/52dd98f70d130d018355fcda4a3f48219ed6c447))


### Bug Fixes

* **android:** add Text wrapper to disable includeFontPadding globally (KII-89) ([5400955](https://codeberg.org/kblcuk/kopiika/commit/540095549269403571537b1ed4cc4a1419fc12c5))
* scope account upcoming indicator to current month (KII-89) ([b033be5](https://codeberg.org/kblcuk/kopiika/commit/b033be5095cdb2e620ff70f667dcb46919e3c2d6))

## [0.3.2](https://codeberg.org/kblcuk/kopiika/compare/v0.3.1...v0.3.2) (2026-04-19)

## [0.3.1](https://codeberg.org/kblcuk/kopiika/compare/v0.3.0...v0.3.1) (2026-04-19)


### Features

* **dnd:** add computeEdgeSpeed worklet utility and SECTION_INDEX (KII-12) ([258b068](https://codeberg.org/kblcuk/kopiika/commit/258b0685e82258bf705748e39d22692798dda364))
* **dnd:** useDragAutoScroll hook — UI-thread vertical + horizontal auto-scroll (KII-12) ([c6a057f](https://codeberg.org/kblcuk/kopiika/commit/c6a057f0004c908ea1ce47e44baaaca2ee70821f))
* **dnd:** wire drag auto-scroll into grid and home screen (KII-12) ([38806db](https://codeberg.org/kblcuk/kopiika/commit/38806dbd24354d5f423ecc0daa016a5bace7c52a))
* **history:** show scheduled date on upcoming transactions ([819c602](https://codeberg.org/kblcuk/kopiika/commit/819c60261e4a4a4a836bf2bb856f35486fd1a705))
* **recurrence:** Add entity deletion prompt for active templates ([d35a7a3](https://codeberg.org/kblcuk/kopiika/commit/d35a7a32d99afbb0403ae9de77af2caec63d3782))
* **recurrence:** Add occurrence generation logic with TDD (KII-66) ([f699af6](https://codeberg.org/kblcuk/kopiika/commit/f699af6403db7a9cc805aec039423f17637104f5))
* **recurrence:** Add recurrence state, backfill, and series actions to store ([34e15c7](https://codeberg.org/kblcuk/kopiika/commit/34e15c78ca967c0d877caf974dc893d20cccd745))
* **recurrence:** add recurrence template CRUD with TDD (KII-66) ([b9863b7](https://codeberg.org/kblcuk/kopiika/commit/b9863b7badcd6d410507e63a276fb17dd18b0ba4))
* **recurrence:** add recurrence_templates schema and migration (KII-66) ([7f3adf3](https://codeberg.org/kblcuk/kopiika/commit/7f3adf33547d110b901294fd1bee9b1eee6580df))
* **recurrence:** Add repeat UI to transaction modal (KII-66) ([0a5e7f4](https://codeberg.org/kblcuk/kopiika/commit/0a5e7f47742c469f80a41376c261bee658f61450))
* **recurrence:** Add series action sheets for edit/delete (KII-66) ([6d457ba](https://codeberg.org/kblcuk/kopiika/commit/6d457ba390e4c98f208d0a8fc1d335c6be65c5cc))
* **recurrence:** add series-aware transaction queries with TDD (KII-66) ([720e72a](https://codeberg.org/kblcuk/kopiika/commit/720e72a092e298c9843d567a5e0ad6d67a992b49))
* **recurrence:** final integration and export/import support (KII-66) ([08a6f71](https://codeberg.org/kblcuk/kopiika/commit/08a6f71914e0f165deabbbe24ecfeb33eaba0c1b))
* **recurrence:** show repeat icon on series transactions (KII-66) ([396eea5](https://codeberg.org/kblcuk/kopiika/commit/396eea5843f8cd84819230c5b7069823209dd753))
* **savings:** Open reservation amount field empty instead of pre-filled ([fcc8a3e](https://codeberg.org/kblcuk/kopiika/commit/fcc8a3e4c069a620ff9329bdb19c07bc75adf02e))
* **sheet:** add SheetHeader and backdrop dimming to whats-new modal ([66db069](https://codeberg.org/kblcuk/kopiika/commit/66db06936ba05fa385f327ea48f32f2cbc8c7c73))
* **sheet:** add SheetHeader component with grabber pill and close button ([d5490ea](https://codeberg.org/kblcuk/kopiika/commit/d5490ea6d15744b5c4b3652e4c4bbe7cfab7f567))
* **sheet:** convert reservation modal to pageSheet with header bar ([cf40cd0](https://codeberg.org/kblcuk/kopiika/commit/cf40cd02ffb8d6bebcb4c3a8e8ee8d5b1c62d4b1))


### Bug Fixes

* **recurrence:** add entity relation backrefs and series_id comment ([5b6897f](https://codeberg.org/kblcuk/kopiika/commit/5b6897f2f40d00faf0404f99c8a9db614d745a05))
* **recurrence:** address review — monthly drift, batch atomicity, import series_id, store consistency ([3e6e0c2](https://codeberg.org/kblcuk/kopiika/commit/3e6e0c21a04824df7ec4dd4c0884071fc24c734e))
* **recurrence:** review fixes — template store sync, Date.now race, unused param ([ef53508](https://codeberg.org/kblcuk/kopiika/commit/ef53508fcb72eeeefdee3e5e72d7fe4178253d88))
* **test:** Align react-test-renderer with React 19.2 and fix test setup ([fbaf7b4](https://codeberg.org/kblcuk/kopiika/commit/fbaf7b43885542bee6615742c55fa4110bdce490))

## [0.3.0](https://codeberg.org/kblcuk/kopiika/compare/v0.2.20...v0.3.0) (2026-04-18)


### Bug Fixes

* **accounts:** Recreate system entity on initialize if missing ([2e0369d](https://codeberg.org/kblcuk/kopiika/commit/2e0369d1b9fb9c3056d80a2e8df4322eb69052ec))
* **format:** prevent "-0,00" display for near-zero balances ([010ac9a](https://codeberg.org/kblcuk/kopiika/commit/010ac9a575bd3782a72d9e2deab685bc39421511))

## [0.2.20](https://codeberg.org/kblcuk/kopiika/compare/v0.2.19...v0.2.20) (2026-04-17)


### Bug Fixes

* **modals:** Dismiss keyboard on cancel/dismiss paths (iOS) ([8da2bec](https://codeberg.org/kblcuk/kopiika/commit/8da2bec5dfb35a5ce88a756e1608297480a04778))
* **transactions:** Add missing useEffect deps for entity pre-fill ([39dab6b](https://codeberg.org/kblcuk/kopiika/commit/39dab6b054e09e061248b0c3132c4206b0327a3a))

## [0.2.19](https://codeberg.org/kblcuk/kopiika/compare/v0.2.18...v0.2.19) (2026-04-13)


### Features

* **transactions:** Allow changing From and To entities in DnD flow ([d3c68ce](https://codeberg.org/kblcuk/kopiika/commit/d3c68ce7af3362fa0882c480f82af041b796b2f4))


### Bug Fixes

* **modals:** Dismiss keyboard before closing modals ([81ad076](https://codeberg.org/kblcuk/kopiika/commit/81ad076e8c4335b623a5de6ffcd05cb400308c1f))
* **transactions:** Exclude balance adjustment from entity pickers ([c903782](https://codeberg.org/kblcuk/kopiika/commit/c9037823e55ce289420042f02cb4f9299648cc6f))

## [0.2.18](https://codeberg.org/kblcuk/kopiika/compare/v0.2.17...v0.2.18) (2026-04-11)


### Features

* **accounts:** Add default account setting for transactions ([7fa3b41](https://codeberg.org/kblcuk/kopiika/commit/7fa3b41649b8d0bdaf7d3c82e8fd3e5cb2ef14ad))
* **history:** Redesign transaction row to stacked layout ([72bf663](https://codeberg.org/kblcuk/kopiika/commit/72bf663f45a18bb97a6f835fdb75b8e23546e009))

## [0.2.17](https://codeberg.org/kblcuk/kopiika/compare/v0.2.16...v0.2.17) (2026-04-11)


### Bug Fixes

* **accounts:** Stop double-counting savings transfers in account available balance ([b81af7c](https://codeberg.org/kblcuk/kopiika/commit/b81af7c33ee2de4a60533cfefdc85a4391a7dae4))

## [0.2.16](https://codeberg.org/kblcuk/kopiika/compare/v0.2.15...v0.2.16) (2026-04-11)


### Features

* **accounts:** Show per-saving reservation breakdown in account edit mode (KII-70) ([fa8564b](https://codeberg.org/kblcuk/kopiika/commit/fa8564bc0c5d9194d4c5382fa2069393da349586))
* **history:** Add transaction search by note and amount (KII-78) ([218139c](https://codeberg.org/kblcuk/kopiika/commit/218139ce56706e54798d7d09301e6998733eabf1))

## [0.2.15](https://codeberg.org/kblcuk/kopiika/compare/v0.2.14...v0.2.15) (2026-04-11)


### Features

* **savings:** Promote reservations to transactions for History visibility (KII-61) ([c30e180](https://codeberg.org/kblcuk/kopiika/commit/c30e18027539f7136d0d56c6554e200e13d00428))

## [0.2.14](https://codeberg.org/kblcuk/kopiika/compare/v0.2.13...v0.2.14) (2026-04-06)


### Features

* **accounts:** Remove planned amount from creation and show entity name in removed labels (KII-52) ([97edcc6](https://codeberg.org/kblcuk/kopiika/commit/97edcc6997b60176d371d76571da97e25d3916d8))
* **savings:** Use light blue progress for in-progress goals (KII-54) ([34657a0](https://codeberg.org/kblcuk/kopiika/commit/34657a0c48662b8dcaea1fe866a97b1d05ef5589))


### Bug Fixes

* **categories:** Lower healthy progress threshold from 70% to 60% (KII-53) ([c877653](https://codeberg.org/kblcuk/kopiika/commit/c877653520006949be7874772df87b334310c93a))
* **keyboard:** Update react-native-keyboard-controller ([1767bdd](https://codeberg.org/kblcuk/kopiika/commit/1767bdd1c50e447c4ef421784277ae89b19439d0))

## [0.2.13](https://codeberg.org/kblcuk/kopiika/compare/v0.2.12...v0.2.13) (2026-04-06)


### Features

* **transactions:** Add expression support to all amount modals (KII-44) ([35a87ad](https://codeberg.org/kblcuk/kopiika/commit/35a87ad0dc6d901f557359b4007de3f942ddd610))


### Bug Fixes

* **ui:** Replace KeyboardAvoidingView with KeyboardAwareScrollView (KII-72) ([c8db52d](https://codeberg.org/kblcuk/kopiika/commit/c8db52dda15bacaca30f9cc7fdfd0faf4e4a7d97))

## [0.2.12](https://codeberg.org/kblcuk/kopiika/compare/v0.2.11...v0.2.12) (2026-04-05)


### Features

* **transactions:** Add arithmetic expression support to amount input (KII-44) ([3ae96c1](https://codeberg.org/kblcuk/kopiika/commit/3ae96c18dd921894d7cb9f350db712021bfb2ab8))

## [0.2.11](https://codeberg.org/kblcuk/kopiika/compare/v0.2.10...v0.2.11) (2026-04-04)


### Features

* **transactions:** Add account→income refund flow and generalize RefundPickerModal ([9074b2d](https://codeberg.org/kblcuk/kopiika/commit/9074b2dbf5e330044c15e795f3aaa35a962da4ee))
* **transactions:** Enforce allowed/blocked transaction pairs and add refund flow (KII-49) ([540e49a](https://codeberg.org/kblcuk/kopiika/commit/540e49ade0cbe7943878e928037a61ae45c62705))

## [0.2.10](https://codeberg.org/kblcuk/kopiika/compare/v0.2.9...v0.2.10) (2026-04-04)


### Bug Fixes

* **db:** await transaction in softDeleteEntity ([4b2113d](https://codeberg.org/kblcuk/kopiika/commit/4b2113d3a025557d846c9d41c2bb52ffd3d41082))
* **dnd:** defer re-renders during drag start to prevent gesture loss ([2024212](https://codeberg.org/kblcuk/kopiika/commit/20242127d8badd0dfa1f79dbcd5f5f6ecbfc75a2))
* **history:** Prevent timestamp-boundary race in past/upcoming split ([7dc5056](https://codeberg.org/kblcuk/kopiika/commit/7dc50565d59f03e7a9960a9e3e99c0e1436d2233))
* **savings:** use entered amount as transaction total, not entered + funded (KII-71) ([26c25e9](https://codeberg.org/kblcuk/kopiika/commit/26c25e9820db894be0440a99b84b9bc9aba4455f))

## [0.2.9](https://codeberg.org/kblcuk/kopiika/compare/v0.2.8...v0.2.9) (2026-04-03)


### Bug Fixes

* **quickadd:** update transaction modal tests for manual entity picker flow ([5e02d1b](https://codeberg.org/kblcuk/kopiika/commit/5e02d1b3416003732898a542e5703abcbadc226c))
* **ui:** remove icon search field and fix history entity filter persistence ([b0956cf](https://codeberg.org/kblcuk/kopiika/commit/b0956cf4e83b4a0b95e928ce98743b67cc9f2d8b))

## [0.2.8](https://codeberg.org/kblcuk/kopiika/compare/v0.2.7...v0.2.8) (2026-04-03)


### Bug Fixes

* **create-modal:** Move hooks above early return and add bunfig ([a858cb8](https://codeberg.org/kblcuk/kopiika/commit/a858cb8f595e62aec9e8c5159cbe4e8ee194f0c1))
* **entity:** Hide remaining for unplanned entities ([0955153](https://codeberg.org/kblcuk/kopiika/commit/0955153927b24996f6d2f61a4d193ac40796232c))
* **fastlane:** Stabilize match signing setup ([241423f](https://codeberg.org/kblcuk/kopiika/commit/241423f3e9c1364b5d9a4abb609ddad6f17563d3))
* **income:** Polish dashboard bubble, progress ring, and edit mode ([a5473ce](https://codeberg.org/kblcuk/kopiika/commit/a5473ce219bba4876f5aabcd192828632fb1efc6))

## [0.2.7](https://codeberg.org/kblcuk/kopiika/compare/v0.2.6...v0.2.7) (2026-03-23)

### Bug Fixes

- **fastlane:** prevent match from hanging on SSH auth failures ([0a2428a](https://codeberg.org/kblcuk/kopiika/commit/0a2428a34131456f2adae92160e5eb1c17aa8d20))
- **fastlane:** skip beta lanes when build already published ([4d17b19](https://codeberg.org/kblcuk/kopiika/commit/4d17b1948d7f5e7818877074a1df567014f1fb80))
- **quickadd:** reset transaction modal state on repeated tab visits ([0169e72](https://codeberg.org/kblcuk/kopiika/commit/0169e726c8a943981bd5a9b8acdc11277e502a45))

## [0.2.6](https://codeberg.org/kblcuk/kopiika/compare/v0.2.4...v0.2.6) (2026-03-22)

### Bug Fixes

- **dnd:** eliminate activation race and improve drag/scroll separation ([4d6122c](https://codeberg.org/kblcuk/kopiika/commit/4d6122c7a305774d71e93a33bbb087f3b643a45b))
- **icon-picker:** Improve show all and collapse behavior ([7e9e62c](https://codeberg.org/kblcuk/kopiika/commit/7e9e62c44e37c36d1f17fc010f2672ee68ea490b))
- **modals:** unify numeric input keyboard behavior ([0c2d728](https://codeberg.org/kblcuk/kopiika/commit/0c2d728d1b2b64d00380780f4fd28eb27ca5c0c2))

## [0.2.4](https://codeberg.org/kblcuk/kopiika/compare/v0.2.3...v0.2.4) (2026-03-14)

### Features

- **entities:** Preserve history for deleted items ([3a50415](https://codeberg.org/kblcuk/kopiika/commit/3a504154e8e31024f45ee1f184691b3df152cf6d))

### Bug Fixes

- **plans:** Align all-time plan semantics ([3997946](https://codeberg.org/kblcuk/kopiika/commit/399794635a2e3140315f6eb73b4e2626e959f251))

## [0.2.3](https://codeberg.org/kblcuk/kopiika/compare/v0.2.2...v0.2.3) (2026-03-13)

### Bug Fixes

- **drag:** Prevent accidental reorder in transaction mode ([0aecb2a](https://codeberg.org/kblcuk/kopiika/commit/0aecb2a33b3712d14147c46b30263481b98dc39d))
- **ui:** a bit more space between entity title and bubble ([cd16547](https://codeberg.org/kblcuk/kopiika/commit/cd16547e450933e41d70fee97793c6570aa432af))
- **ux:** actually disable auto-capitalization ([afd9fb9](https://codeberg.org/kblcuk/kopiika/commit/afd9fb941d8d0530783df72df6fc42eed7f1e6fe))

## [0.2.2](https://codeberg.org/kblcuk/kopiika/compare/v0.2.1...v0.2.2) (2026-03-13)

### Features

- **release:** orchestrate parallel iOS + Android builds with mise ([b8175b3](https://codeberg.org/kblcuk/kopiika/commit/b8175b370912e87c11646af8c27f42c3a8eca86c))

### Bug Fixes

- **android:** Upload only AAB artifacts to Play ([c17e552](https://codeberg.org/kblcuk/kopiika/commit/c17e55266976f655af4e76bc4589723a1bc53663))
- **dashboard:** Restrict entity reordering to edit mode ([b4b612b](https://codeberg.org/kblcuk/kopiika/commit/b4b612b4548eb005eca76637717bf90fa569bc6a))
- **dashboard:** Wrap long entity names in bubbles ([ff70792](https://codeberg.org/kblcuk/kopiika/commit/ff70792af85bd3fc2144830453264808e0228a2b))
- **release:** Sync version metadata before release builds ([634a4bf](https://codeberg.org/kblcuk/kopiika/commit/634a4bf690398b9d156a7b0906adfc382e217992))
- **startup:** Remove duplicate app initialization paths ([2f66cb3](https://codeberg.org/kblcuk/kopiika/commit/2f66cb341ad900ada5b03e6eb0e3385e13613163))
- **ux:** disable auto-capitalization ([33f4e3b](https://codeberg.org/kblcuk/kopiika/commit/33f4e3be73b0552a2d1394d5d4aab2894724a861))

## [0.2.1](https://codeberg.org/kblcuk/kopiika/compare/v0.2.0...v0.2.1) (2026-03-13)

### Features

- **release:** in-app changelog modal, store release notes, and Telegram notifications ([08fcfd7](https://codeberg.org/kblcuk/kopiika/commit/08fcfd7a91f5ab24626c08d7fc583b11b3089906))
- **savings:** show reservations in saving entity detail modal ([2e2eeb1](https://codeberg.org/kblcuk/kopiika/commit/2e2eeb13cf5bfb597d7ffe9f63cbb03f7e9c1bf6))

## [0.2.0](https://codeberg.org/kblcuk/kopiika/compare/v0.0.23...v0.2.0) (2026-03-13)

### Features

- **db:** add reservations table with migration and CRUD operations ([4b4a3f2](https://codeberg.org/kblcuk/kopiika/commit/4b4a3f2ffdd1a35bb10fa292b512dfc8cb9a8e69))
- **savings:** add reservation modal for account-to-saving drag ([9cb7b2a](https://codeberg.org/kblcuk/kopiika/commit/9cb7b2ab884e61cec8776a3d1b812530ade06854))
- **savings:** fund from savings when creating transactions ([554d817](https://codeberg.org/kblcuk/kopiika/commit/554d8170093b875acd8779ddb9323d077aa208c1))
- **store:** integrate reservations into state and balance calculation ([3519c85](https://codeberg.org/kblcuk/kopiika/commit/3519c8520aac217ccff03aa3bc6a72a23ee00031))
- **ui:** account bubbles show available/total instead of planned ([2817b61](https://codeberg.org/kblcuk/kopiika/commit/2817b61b98f1170145e17e155690ed6ce41e381b))
- **ui:** account edit modal shows available instead of planned/remaining ([e89a573](https://codeberg.org/kblcuk/kopiika/commit/e89a5739f8ebc96dafb0b05d4a884717e8e1f6af))
- **ui:** show reserved amount on account entity bubbles ([1365625](https://codeberg.org/kblcuk/kopiika/commit/1365625aa7a613ff7832ae6cff33b4201ac93cae))

### Bug Fixes

- **android:** Normalize custom text input metrics ([6fff675](https://codeberg.org/kblcuk/kopiika/commit/6fff67549eca9d567b8517c4dbeab6130648ed84))
- default to build 0 for ios ([c8f67ef](https://codeberg.org/kblcuk/kopiika/commit/c8f67ef92e384787d04bf6d036e15ad5a25b7834))
- **history:** scope upcoming transactions to selected period ([ed856fa](https://codeberg.org/kblcuk/kopiika/commit/ed856fa8793bf8ee30ab6c31e823f13ad66d7f58))
- **savings:** block outgoing transactions from savings entities ([6477fb5](https://codeberg.org/kblcuk/kopiika/commit/6477fb53fcc981867bf5a01d9f14507227a4d36e))
- **savings:** block outgoing transactions from savings via drag-and-drop ([402fdb9](https://codeberg.org/kblcuk/kopiika/commit/402fdb961b8f3fb86dd14b838108d858664e011c))
- **savings:** review fixes — drop PK mutation on upsert, add reservation tests ([bcbc2aa](https://codeberg.org/kblcuk/kopiika/commit/bcbc2aa8b3b8b0941fb779bd87b3c88ce04da281))
- **ui:** Normalize entity input sizing ([ae09184](https://codeberg.org/kblcuk/kopiika/commit/ae0918481cf8417d312391bd87e2c00bf1c06e76))

## [0.1.0](https://codeberg.org/kblcuk/kopiika/compare/v0.0.23...v0.1.0) (2026-03-08)

### Bug Fixes

- **android:** Normalize custom text input metrics ([6fff675](https://codeberg.org/kblcuk/kopiika/commit/6fff67549eca9d567b8517c4dbeab6130648ed84))
- default to build 0 for ios ([c8f67ef](https://codeberg.org/kblcuk/kopiika/commit/c8f67ef92e384787d04bf6d036e15ad5a25b7834))
- **ui:** Normalize entity input sizing ([ae09184](https://codeberg.org/kblcuk/kopiika/commit/ae0918481cf8417d312391bd87e2c00bf1c06e76))

## [0.0.23](https://codeberg.org/kblcuk/kopiika/compare/v0.0.20...v0.0.23) (2026-03-08)

### Features

- **icons:** Add searchable entity icon picker ([4907cdc](https://codeberg.org/kblcuk/kopiika/commit/4907cdc0ef29ae35642b691a26608159baa1614f))
- privacy policy link ([644aae6](https://codeberg.org/kblcuk/kopiika/commit/644aae68327ec40f94340c9ec5ef064a2c39ddb5))
- **release:** Add Android Play Fastlane pipeline ([9138bf4](https://codeberg.org/kblcuk/kopiika/commit/9138bf47de210862b6880e3f93c66eae7f97a3e2))
- **release:** Add Play doctor and build-number sync lanes ([76fbc0b](https://codeberg.org/kblcuk/kopiika/commit/76fbc0b0990641081694016433fd4c4a04296ca7))

### Bug Fixes

- **interactions:** unify entity editing behind section edit mode ([3ea47fa](https://codeberg.org/kblcuk/kopiika/commit/3ea47fae2967fe37ac09658c59ce11488567c04f))

## [0.0.20](https://codeberg.org/kblcuk/kopiika/compare/v0.0.19...v0.0.20) (2026-03-05)

### Features

- add hysteresis utility for drag boundary detection ([2a27933](https://codeberg.org/kblcuk/kopiika/commit/2a279334c86d85cf21bc7887260c3b9e9f8d60f9))

### Bug Fixes

- eliminate drag mode jitter near grid boundaries ([507f991](https://codeberg.org/kblcuk/kopiika/commit/507f991fa6578b081f4e37e2ddd5b2d29e214aa5))
- pin gradle to exact version ([dcfda2b](https://codeberg.org/kblcuk/kopiika/commit/dcfda2b63e132acbc2765e47ce62c69a12a90441))
- scope TestFlight build number to current app version ([56611ff](https://codeberg.org/kblcuk/kopiika/commit/56611ffe1401c6d99a5197be7b25528c851e3708))

## [0.0.19](https://codeberg.org/kblcuk/kopiika/compare/v0.0.16...v0.0.19) (2026-03-01)

### Features

- add quick-add FAB to tab bar ([7e2beaa](https://codeberg.org/kblcuk/kopiika/commit/7e2beaa96d738a2b32eaf47c78224d3ba0ff90f6))
- add scheduled transaction support ([5bdc4b1](https://codeberg.org/kblcuk/kopiika/commit/5bdc4b1f4cc54cc198ac0278fd470eaea548f378))
- history totals, summary sparklines + section totals ([651fe95](https://codeberg.org/kblcuk/kopiika/commit/651fe9500fbfabe047b31b9902cdf2b99cec4e47))
- make sure modals don't go out of safe zone ([e8b0232](https://codeberg.org/kblcuk/kopiika/commit/e8b0232639ffae696b3ae1f77a411c03993885c2))

### Bug Fixes

- move quick add modal into routed screen ([ad40677](https://codeberg.org/kblcuk/kopiika/commit/ad40677b10e2b39ddcb2efc3b12dcda8663c1845))
- summary actuals showing wrong month's data ([928661f](https://codeberg.org/kblcuk/kopiika/commit/928661f85c961fda12f99f1cc8901aae2254a92a))
- use import instead of require for nativewind preset ([e3ebf7c](https://codeberg.org/kblcuk/kopiika/commit/e3ebf7caf1eb92c6cf16b60796dbb29da0ee03e1)), closes [/github.com/nativewind/nativewind/issues/1330#issuecomment-2737061344](https://codeberg.org/kblcuk//github.com/nativewind/nativewind/issues/1330/issues/issuecomment-2737061344)

## [0.0.16](https://codeberg.org/kblcuk/kopiika/compare/v0.0.15...v0.0.16) (2026-02-19)

### Features

- split transaction support in transaction modal ([7f934f1](https://codeberg.org/kblcuk/kopiika/commit/7f934f1abc1cf89a406e8fc2f392959997815078))
