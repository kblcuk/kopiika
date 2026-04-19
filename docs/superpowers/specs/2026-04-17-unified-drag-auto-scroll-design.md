# Unified Drag Auto-Scroll (KII-12) — Final

## Problem

When dragging an entity across sections (e.g. account → category), the screen scrolls
vertically but the **target** section's horizontal ScrollView never scrolls. Off-screen
items in the hovered section are unreachable.

`react-native-sortables`' built-in `autoScrollDirection="horizontal"` only scrolls the
**source** grid's ScrollView — there's no API to redirect it mid-drag.

## Solution: `useDragAutoScroll` hook

A React hook (`src/hooks/use-drag-auto-scroll.ts`) that runs both vertical and horizontal
auto-scroll on the **UI thread** via Reanimated `useFrameCallback`.

### Threading model

All scroll-during-drag logic runs on the UI thread:
- `useFrameCallback` for the tick loop
- `SharedValue` for touch position, scroll offsets, section bounds
- Reanimated `scrollTo` worklet for programmatic scrolling
- `runOnJS` only for throttled `remeasureAllDropZones`

### Vertical scroll

Scrolls the outer `Animated.ScrollView` when touch enters top/bottom edge zones (80px).
`computeEdgeSpeed` computes speed linearly from proximity (capped at 14px/frame).

Scroll metrics (content height, layout height) captured via `useAnimatedScrollHandler`
(ongoing) + `onLayout`/`onContentSizeChange` (initial seed before first scroll event).

### Horizontal target-scroll

When dragging across sections, auto-scrolls the hovered target section's horizontal
ScrollView when touch enters left/right edge zones (60px, max 10px/frame).

**Section refs:** Hook creates 4 `useAnimatedRef<Animated.ScrollView>()` (one per
entity type). Passed to grids via `sectionScrollRef` prop. Grids use them for both
their `<Animated.ScrollView>` and `Sortable.Grid`'s `scrollableRef`.

**Hover detection:** Pre-tracked Y bounds in individual SharedValues
(`sectionTop0`/`sectionBot0` through 3). Content-relative coords, adjusted by current
outer scroll offset in the tick. Updated from grid's `onLayout` via `measureInWindow`.
Individual SharedValues avoid read-modify-write races from concurrent `onLayout` calls.

**Scroll offset tracking:** `useScrollOffset(sectionRef)` per section — auto-tracked
on UI thread by Reanimated.

**Max offset:** Individual SharedValues (`sectionMaxH0`-`3`) updated from grid's
`onLayout` + `onContentSizeChange` (contentWidth - visibleWidth).

**Source guard:** `react-native-sortables`' built-in auto-scroll disabled in transaction
mode (`autoScrollEnabled={!isTransactionMode}`). In reorder mode (same-section drag),
the library's auto-scroll handles it.

### Worklet pattern

Dynamic array indexing of SharedValues/AnimatedRefs doesn't work in Reanimated worklets.
All per-section access uses explicit `switch`-based helpers:
- `getSectionOffset(i)` — reads `sectionOffset0..3.value`
- `getSectionBounds(i)` — reads `sectionTop0..3.value` / `sectionBot0..3.value`
- `getSectionMaxOffset(i)` — reads `sectionMaxH0..3.value`
- `scrollSectionTo(i, x)` — calls `scrollTo(sectionRef0..3, x, 0, false)`

### Constants

```ts
const V_EDGE_ZONE = 80;     // px — vertical edge zone
const V_MAX_SPEED = 14;     // px/frame
const H_EDGE_ZONE = 60;     // px — horizontal edge zone (smaller)
const H_MAX_SPEED = 10;     // px/frame (gentler)
```

### `SECTION_INDEX`

```ts
export const SECTION_INDEX: Record<EntityType, number> = {
  income: 0, account: 1, category: 2, saving: 3,
};
export const SECTION_COUNT = Object.keys(SECTION_INDEX).length;
```

## Hook API

```ts
function useDragAutoScroll(): {
  outerScrollRef: AnimatedRef<Animated.ScrollView>;
  scrollHandler: /* useAnimatedScrollHandler result */;
  handleOuterLayout: (e) => void;
  handleOuterContentSizeChange: (w, h) => void;
  startAutoScroll: () => void;
  stopAutoScroll: () => void;
  updateDragTouch: (x: number, y: number) => void;
  sectionRefs: AnimatedRef<Animated.ScrollView>[];
  setDragSourceIndex: (index: number) => void;
  updateSectionBounds: (index: number, screenY: number, height: number) => void;
  updateSectionMaxOffset: (index: number, contentWidth: number, visibleWidth: number) => void;
};
```

## Grid props (new)

```ts
sectionScrollRef?: AnimatedRef<Animated.ScrollView>;
sectionIndex?: number;
onSectionMaxOffset?: (index: number, contentWidth: number, visibleWidth: number) => void;
onSectionBounds?: (index: number, screenY: number, height: number) => void;
updateDragTouch?: (x: number, y: number) => void;
```

## Files

- `src/hooks/use-drag-auto-scroll.ts` — the hook
- `src/utils/drag-auto-scroll.ts` — `computeEdgeSpeed` worklet + `SECTION_INDEX`
- `src/utils/__tests__/drag-auto-scroll.test.ts` — 10 bun:test tests
- `src/components/sortable-entity-grid.tsx` — grid accepts section ref, reports metrics
- `app/(tabs)/index.tsx` — consumes hook, wires grids

Deleted: `src/utils/vertical-auto-scroll.ts`, `src/utils/__tests__/vertical-auto-scroll.test.ts`
