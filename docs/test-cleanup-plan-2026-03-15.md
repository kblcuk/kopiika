# Test Cleanup Plan

Date: 2026-03-15

## Goal

Shift the test suite toward domain behavior and user-visible outcomes, and away from
implementation-detail assertions that create churn without protecting product value.

## Review Summary

The strongest coverage today is in:

- `src/db/__tests__`
- `src/store/__tests__`
- `src/utils/__tests__/import.test.ts`
- `app/(tabs)/__tests__/history.test.tsx`
- `src/components/__tests__/entity-detail-modal.test.tsx`

The main weak spots are:

- refetch and call-count assertions in `app/(tabs)/__tests__/summary.test.tsx`
- heavy prop-plumbing tests in `app/__tests__/home-navigation.test.tsx`
- drag tests built around mocked internals in `src/components/__tests__/sortable-entity-grid.test.tsx`
- style- and view-prop assertions in several component tests
- thin reservation modal coverage despite reservations being a core product flow

## Execution Order

1. Remove or trim the lowest-value style-only tests.
2. Rewrite `summary.test.tsx` so it checks rendered outcomes instead of effect mechanics.
3. Run the targeted tests for that slice and commit.
4. Rewrite `home-navigation.test.tsx` and `sortable-entity-grid.test.tsx` to reduce prop
   plumbing and mocked implementation coupling.
5. Run the targeted tests for that slice and commit.
6. Add missing reservation-flow coverage in `reservation-modal` and related flows.
7. Run the targeted tests for that slice and commit.
8. Review legacy monthly-plan fixtures and either rename them as compatibility coverage or
   convert them to current all-time semantics.
9. Run the broader test suite and commit the final cleanup.

## Guardrails

- Keep each commit independently green.
- Prefer behavior and domain rules over exact classes, view props, and internal call counts.
- Keep at least one useful regression test when removing a brittle assertion.
- Do not remove coverage for core rules around balances, reservations, overspending, history,
  or import validation.
