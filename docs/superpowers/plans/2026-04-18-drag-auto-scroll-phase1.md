# Drag Auto-Scroll Phase 1: Vertical Scroll to UI Thread

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the vertical auto-scroll during drag from JS thread (`requestAnimationFrame` + `ScrollView.scrollTo`) to UI thread (Reanimated `useFrameCallback` + worklet `scrollTo`), keeping identical behavior.

**Architecture:** Extract the edge-speed computation into a pure testable utility. Build a `useDragAutoScroll` hook that runs the scroll tick on the UI thread via `useFrameCallback`. The home screen consumes the hook and passes `updateDragTouch` to grids as a prop. Delete the old `vertical-auto-scroll.ts` module.

**Tech Stack:** react-native-reanimated (`useFrameCallback`, `useAnimatedRef`, `useAnimatedScrollHandler`, `scrollTo`, `useSharedValue`, `runOnJS`), bun:test

**Spec:** `docs/superpowers/specs/2026-04-17-unified-drag-auto-scroll-design.md` (Phase 1 section)

---

### Task 1: Pure `computeEdgeSpeed` utility + tests

**Files:**

- Create: `src/utils/drag-auto-scroll.ts`
- Create: `src/utils/__tests__/drag-auto-scroll.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/utils/__tests__/drag-auto-scroll.test.ts
import { describe, it, expect } from 'bun:test';
import { computeEdgeSpeed } from '../drag-auto-scroll';

const SIZE = 800;
const EDGE_ZONE = 80;
const MAX_SPEED = 14;

describe('computeEdgeSpeed', () => {
	it('returns 0 when position is in the center', () => {
		expect(computeEdgeSpeed(400, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(0);
	});

	it('returns positive speed near the end edge', () => {
		// 40px into the 80px end zone → proximity 0.5
		const speed = computeEdgeSpeed(SIZE - 40, SIZE, EDGE_ZONE, MAX_SPEED);
		expect(speed).toBeCloseTo(MAX_SPEED * 0.5);
	});

	it('returns negative speed near the start edge', () => {
		// 40px into the 80px start zone → proximity 0.5
		const speed = computeEdgeSpeed(40, SIZE, EDGE_ZONE, MAX_SPEED);
		expect(speed).toBeCloseTo(-MAX_SPEED * 0.5);
	});

	it('caps speed at maxSpeed when at the very edge', () => {
		expect(computeEdgeSpeed(SIZE, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(MAX_SPEED);
		expect(computeEdgeSpeed(0, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(-MAX_SPEED);
	});

	it('caps speed at maxSpeed when beyond the edge', () => {
		expect(computeEdgeSpeed(SIZE + 50, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(MAX_SPEED);
		expect(computeEdgeSpeed(-50, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(-MAX_SPEED);
	});

	it('returns 0 at exact boundary of edge zone', () => {
		// At exactly the start of end zone (SIZE - EDGE_ZONE) → proximity 0
		expect(computeEdgeSpeed(SIZE - EDGE_ZONE, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(0);
		// At exactly the end of start zone (EDGE_ZONE) → proximity 0
		expect(computeEdgeSpeed(EDGE_ZONE, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/utils/__tests__/drag-auto-scroll.test.ts`
Expected: FAIL — `computeEdgeSpeed` is not exported / not found

- [ ] **Step 3: Implement `computeEdgeSpeed`**

```ts
// src/utils/drag-auto-scroll.ts

/**
 * Compute scroll speed based on how deep a touch position is in an edge zone.
 *
 * Returns 0 in the center, positive near the end (bottom/right),
 * negative near the start (top/left). Speed scales linearly with
 * proximity into the zone, capped at +-maxSpeed.
 */
export function computeEdgeSpeed(
	position: number,
	size: number,
	edgeZone: number,
	maxSpeed: number
): number {
	if (position > size - edgeZone) {
		const proximity = (position - (size - edgeZone)) / edgeZone;
		return maxSpeed * Math.min(proximity, 1);
	}
	if (position < edgeZone) {
		const proximity = (edgeZone - position) / edgeZone;
		return -maxSpeed * Math.min(proximity, 1);
	}
	return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/utils/__tests__/drag-auto-scroll.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/drag-auto-scroll.ts src/utils/__tests__/drag-auto-scroll.test.ts
git commit -m "feat(dnd): add computeEdgeSpeed utility for drag auto-scroll (KII-12)"
```

---

### Task 2: Create `useDragAutoScroll` hook

**Files:**

- Create: `src/hooks/use-drag-auto-scroll.ts`

**Context:**

- Reanimated `scrollTo` signature: `scrollTo(animatedRef, x, y, animated)`
- `useFrameCallback(callback, autostart?)` — set `autostart: false`, control via `.setActive()`
- `useAnimatedScrollHandler` returns a worklet-based scroll handler
- Screen dimensions from `Dimensions.get('window')` (mocked as 800x400 in tests via `test/preload.ts`)
- `remeasureAllDropZones` from `@/src/utils/drop-zone` must be called on JS thread after scrolling

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/use-drag-auto-scroll.ts
import { useCallback, useRef } from 'react';
import { Dimensions } from 'react-native';
import Animated, {
	useAnimatedRef,
	useAnimatedScrollHandler,
	useFrameCallback,
	useSharedValue,
	scrollTo,
	runOnJS,
} from 'react-native-reanimated';

import { computeEdgeSpeed } from '@/src/utils/drag-auto-scroll';
import { remeasureAllDropZones } from '@/src/utils/drop-zone';

const EDGE_ZONE = 80;
const MAX_SPEED = 14;
const REMEASURE_THROTTLE_MS = 100;

export function useDragAutoScroll() {
	const outerScrollRef = useAnimatedRef<Animated.ScrollView>();

	const scrollOffset = useSharedValue(0);
	const contentHeight = useSharedValue(0);
	const layoutHeight = useSharedValue(0);
	const touchY = useSharedValue(0);
	const remeasurePending = useSharedValue(false);

	const screenHeight = Dimensions.get('window').height;

	// Throttled remeasure — runs on JS thread
	const doRemeasure = useCallback(() => {
		remeasureAllDropZones();
		setTimeout(() => {
			remeasurePending.value = false;
		}, REMEASURE_THROTTLE_MS);
	}, [remeasurePending]);

	// UI-thread tick
	const frameCallback = useFrameCallback(() => {
		'worklet';
		const maxOffset = Math.max(0, contentHeight.value - layoutHeight.value);
		const speed = computeEdgeSpeed(touchY.value, screenHeight, EDGE_ZONE, MAX_SPEED);

		if (speed === 0) return;

		const currentOffset = scrollOffset.value;
		const newOffset = Math.max(0, Math.min(maxOffset, currentOffset + speed));
		if (Math.abs(newOffset - currentOffset) < 1) return;

		scrollTo(outerScrollRef, 0, newOffset, false);
		// Update immediately so next frame uses the new value.
		// The scroll handler will also set this on the next event — last write wins.
		scrollOffset.value = newOffset;

		if (!remeasurePending.value) {
			remeasurePending.value = true;
			runOnJS(doRemeasure)();
		}
	}, false); // autostart: false

	const startAutoScroll = useCallback(() => {
		frameCallback.setActive(true);
	}, [frameCallback]);

	const stopAutoScroll = useCallback(() => {
		frameCallback.setActive(false);
	}, [frameCallback]);

	const updateDragTouch = useCallback(
		(x: number, y: number) => {
			touchY.value = y;
		},
		[touchY]
	);

	// Captures scroll metrics on UI thread
	const scrollHandler = useAnimatedScrollHandler({
		onScroll: (event) => {
			scrollOffset.value = event.contentOffset.y;
			contentHeight.value = event.contentSize.height;
			layoutHeight.value = event.layoutMeasurement.height;
		},
	});

	return {
		outerScrollRef,
		scrollHandler,
		startAutoScroll,
		stopAutoScroll,
		updateDragTouch,
	};
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `bunx tsc --noEmit src/hooks/use-drag-auto-scroll.ts 2>&1 | head -20`

If tsc can't resolve paths (aliased imports), that's OK — we'll catch real issues
during the full typecheck in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-drag-auto-scroll.ts
git commit -m "feat(dnd): add useDragAutoScroll hook with UI-thread vertical scroll (KII-12)"
```

---

### Task 3: Wire hook into home screen

**Files:**

- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Update imports**

Replace:

```ts
import { View, Text, ScrollView, ActivityIndicator, type NativeScrollEvent } from 'react-native';
```

with:

```ts
import { View, Text, ActivityIndicator } from 'react-native';
```

Replace:

```ts
import {
	setVerticalScrollTarget,
	updateScrollMetrics,
	startVerticalAutoScroll,
	stopVerticalAutoScroll,
} from '@/src/utils/vertical-auto-scroll';
```

with:

```ts
import { useDragAutoScroll } from '@/src/hooks/use-drag-auto-scroll';
```

- [ ] **Step 2: Replace scroll refs and handlers**

Remove these lines near the top of `HomeScreen`:

```ts
const outerScrollRef = useRef<ScrollView>(null);

// Wire the outer ScrollView for vertical auto-scroll during drag
useEffect(() => {
	setVerticalScrollTarget(outerScrollRef);
}, []);

const handleOuterScroll = useCallback((e: { nativeEvent: NativeScrollEvent }) => {
	const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
	updateScrollMetrics(contentOffset.y, contentSize.height, layoutMeasurement.height);
}, []);
```

Add after `const router = useRouter();`:

```ts
const { outerScrollRef, scrollHandler, startAutoScroll, stopAutoScroll, updateDragTouch } =
	useDragAutoScroll();
```

- [ ] **Step 3: Update drag handlers**

In `handleDragStart`, replace `startVerticalAutoScroll()` with `startAutoScroll()`:

```ts
const handleDragStart = useCallback(
	(entity: EntityWithBalance) => {
		setDraggedEntity(entity);
		startAutoScroll();
	},
	[setDraggedEntity, startAutoScroll]
);
```

In `handleDragEnd`, replace `stopVerticalAutoScroll()` with `stopAutoScroll()`:

```ts
	const handleDragEnd = useCallback(
		(entity: EntityWithBalance, targetId: string | null) => {
			setDraggedEntity(null);
			stopAutoScroll();
```

(rest of function unchanged, update dependency array: replace any reference to
the old functions with `startAutoScroll` / `stopAutoScroll`)

- [ ] **Step 4: Update the outer ScrollView**

Replace:

```tsx
			<ScrollView
				ref={outerScrollRef}
				className="flex-1 overflow-visible"
				contentContainerClassName="overflow-visible"
				contentContainerStyle={{ paddingVertical: 12 }}
				onScroll={handleOuterScroll}
				scrollEventThrottle={16}
				onScrollEndDrag={handleScrollEnd}
				onMomentumScrollEnd={handleScrollEnd}
			>
```

with:

```tsx
			<Animated.ScrollView
				ref={outerScrollRef}
				className="flex-1 overflow-visible"
				contentContainerClassName="overflow-visible"
				contentContainerStyle={{ paddingVertical: 12 }}
				onScroll={scrollHandler}
				scrollEventThrottle={16}
				onScrollEndDrag={handleScrollEnd}
				onMomentumScrollEnd={handleScrollEnd}
			>
```

And the closing `</ScrollView>` → `</Animated.ScrollView>`.

Note: `Animated` is already imported from `react-native-reanimated` in this file.
Remove `ScrollView` from the `react-native` import (it may still be used by
`outerScrollRef` type — check; if not, remove it). `NativeScrollEvent` can also
be removed if no longer referenced.

- [ ] **Step 5: Pass `updateDragTouch` to each grid**

Add the `updateDragTouch` prop to every `<SortableEntityGrid>` instance (there are 4):

```tsx
<SortableEntityGrid
	title="Income"
	...
	updateDragTouch={updateDragTouch}
/>
<SortableEntityGrid
	title="Accounts"
	...
	updateDragTouch={updateDragTouch}
/>
<SortableEntityGrid
	title="Categories"
	...
	updateDragTouch={updateDragTouch}
/>
<SortableEntityGrid
	title="Savings · Goal"
	...
	updateDragTouch={updateDragTouch}
/>
```

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "refactor(dnd): wire useDragAutoScroll hook into home screen (KII-12)"
```

---

### Task 4: Update grid to receive `updateDragTouch` as prop

**Files:**

- Modify: `src/components/sortable-entity-grid.tsx`

- [ ] **Step 1: Remove old import**

Delete:

```ts
import { updateDragTouch } from '@/src/utils/vertical-auto-scroll';
```

- [ ] **Step 2: Add prop to interface**

In `SortableEntityGridProps`, add:

```ts
	/** Report drag touch position for auto-scroll. */
	updateDragTouch?: (x: number, y: number) => void;
```

- [ ] **Step 3: Destructure from props**

Add `updateDragTouch` to the destructured props in the function signature:

```ts
export function SortableEntityGrid({
	title,
	type,
	entities,
	onDragStart,
	onDragEnd,
	onTap,
	onAdd,
	dropZonesDisabled = false,
	maxRows = 1,
	dragBehavior = 'transaction',
	editMode = false,
	onToggleEditMode,
	updateDragTouch,
}: SortableEntityGridProps) {
```

- [ ] **Step 4: Update `handleSortableDragMove`**

The existing call `updateDragTouch(touchData.absoluteX, touchData.absoluteY)` on
line 217 stays the same — it now references the prop instead of the module import.

- [ ] **Step 5: Commit**

```bash
git add src/components/sortable-entity-grid.tsx
git commit -m "refactor(dnd): receive updateDragTouch via props instead of module import (KII-12)"
```

---

### Task 5: Update grid drag test

**Files:**

- Modify: `src/components/__tests__/sortable-entity-grid-drag.test.tsx`

- [ ] **Step 1: Remove the old mock**

Delete this mock block:

```ts
jest.mock('@/src/utils/vertical-auto-scroll', () => ({
	updateDragTouch: jest.fn(),
	startVerticalAutoScroll: jest.fn(),
	stopVerticalAutoScroll: jest.fn(),
}));
```

- [ ] **Step 2: Add `updateDragTouch` prop to rendered grids**

In both `render()` calls in the test file, add the prop:

```tsx
<SortableEntityGrid
	title="Accounts"
	type="account"
	entities={entities}
	onDragStart={onDragStart}
	onDragEnd={onDragEnd}
	dragBehavior="transaction"
	updateDragTouch={jest.fn()}
/>
```

- [ ] **Step 3: Run the component tests**

Run: `bun run test:component -- --testPathPattern sortable-entity-grid-drag`
Expected: Both existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/__tests__/sortable-entity-grid-drag.test.tsx
git commit -m "test(dnd): update grid drag tests for prop-based updateDragTouch (KII-12)"
```

---

### Task 6: Delete old module + tests

**Files:**

- Delete: `src/utils/vertical-auto-scroll.ts`
- Delete: `src/utils/__tests__/vertical-auto-scroll.test.ts`

- [ ] **Step 1: Verify no remaining imports**

Run: `grep -r 'vertical-auto-scroll' src/ app/ --include='*.ts' --include='*.tsx'`
Expected: No matches (all imports were updated in Tasks 3-4)

- [ ] **Step 2: Delete old files**

```bash
rm src/utils/vertical-auto-scroll.ts src/utils/__tests__/vertical-auto-scroll.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add -u src/utils/vertical-auto-scroll.ts src/utils/__tests__/vertical-auto-scroll.test.ts
git commit -m "chore(dnd): remove JS-thread vertical-auto-scroll module (KII-12)"
```

---

### Task 7: Full gate — tests, typecheck, lint

- [ ] **Step 1: Run all bun tests**

Run: `bun test`
Expected: All pass (new `drag-auto-scroll` tests + existing util tests)

- [ ] **Step 2: Run component tests**

Run: `bun run test:component`
Expected: All pass (updated grid drag test)

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 4: Run lint**

Run: `bun run lint`
Expected: Clean

- [ ] **Step 5: Fix any issues found, then commit**

If any step fails, fix the issue and create a new commit with the fix.
