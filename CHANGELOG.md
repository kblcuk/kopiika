# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

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
