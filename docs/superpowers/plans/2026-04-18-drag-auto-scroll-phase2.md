# Drag Auto-Scroll Phase 2: Horizontal Target-Scroll

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When dragging across sections, auto-scroll the hovered target section's horizontal ScrollView so off-screen drop targets are reachable.

**Architecture:** Extend the `useDragAutoScroll` hook (phase 1) with section refs, scroll offset tracking via `useScrollOffset`, and `measure()`-based hover detection. The hook creates 4 animated refs (one per section type) and passes them to grids. The frame callback's tick appends horizontal scroll logic after the existing vertical scroll. The grid reports its section's max scroll offset via a callback prop.

**Tech Stack:** react-native-reanimated (`measure`, `useScrollOffset`, `scrollTo`, `useAnimatedRef`), bun:test

**Spec:** `docs/superpowers/specs/2026-04-17-unified-drag-auto-scroll-design.md` (Phase 2 section)

**Phase 1 commits:** `efc4eed`..`c54bd27` — already on main, verified on device.

---

## File structure

| File                                           | Responsibility                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `src/hooks/use-drag-auto-scroll.ts`            | Modify — add section refs, horizontal tick, new return values      |
| `src/utils/drag-auto-scroll.ts`                | Modify — add `SECTION_INDEX` mapping constant                      |
| `src/utils/__tests__/drag-auto-scroll.test.ts` | Modify — add `SECTION_INDEX` tests                                 |
| `src/components/sortable-entity-grid.tsx`      | Modify — accept section ref, report max offset, report drag source |
| `app/(tabs)/index.tsx`                         | Modify — pass new props to grids                                   |

---

### Task 1: Add `SECTION_INDEX` constant + test

**Files:**

- Modify: `src/utils/drag-auto-scroll.ts`
- Modify: `src/utils/__tests__/drag-auto-scroll.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/utils/__tests__/drag-auto-scroll.test.ts`:

```ts
import { computeEdgeSpeed, SECTION_INDEX } from '../drag-auto-scroll';

// ... existing tests ...

describe('SECTION_INDEX', () => {
	it('maps all four entity types to unique indices 0-3', () => {
		expect(SECTION_INDEX.income).toBe(0);
		expect(SECTION_INDEX.account).toBe(1);
		expect(SECTION_INDEX.category).toBe(2);
		expect(SECTION_INDEX.saving).toBe(3);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/utils/__tests__/drag-auto-scroll.test.ts`
Expected: FAIL — `SECTION_INDEX` not exported

- [ ] **Step 3: Add constant**

Add to `src/utils/drag-auto-scroll.ts` after the `computeEdgeSpeed` function:

```ts
import type { EntityType } from '@/src/types';

/** Fixed index for each section type — matches rendering order in HomeScreen. */
export const SECTION_INDEX: Record<EntityType, number> = {
	income: 0,
	account: 1,
	category: 2,
	saving: 3,
};

export const SECTION_COUNT = 4;
```

Note: the `import type` goes at the top of the file.

- [ ] **Step 4: Run tests to verify all pass**

Run: `bun test src/utils/__tests__/drag-auto-scroll.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/drag-auto-scroll.ts src/utils/__tests__/drag-auto-scroll.test.ts
git commit -m "feat(dnd): add SECTION_INDEX constant for section type mapping (KII-12)"
```

---

### Task 2: Extend hook with section refs, horizontal scroll state, and tick logic

**Files:**

- Modify: `src/hooks/use-drag-auto-scroll.ts`

This is the core task. The hook gains:

- 4 animated refs for section ScrollViews
- `useScrollOffset` per section for real-time horizontal offset tracking
- `touchX` shared value
- `sectionMaxOffsets` shared value
- `dragSourceIndex` shared value
- Extended frame callback with horizontal scroll logic using `measure()` for hover detection

- [ ] **Step 1: Replace the entire hook file**

```ts
// src/hooks/use-drag-auto-scroll.ts
import { useCallback } from 'react';
import { Dimensions } from 'react-native';
import Animated, {
	useAnimatedRef,
	useAnimatedScrollHandler,
	useFrameCallback,
	useSharedValue,
	useScrollOffset,
	scrollTo,
	measure,
	runOnJS,
} from 'react-native-reanimated';

import { computeEdgeSpeed, SECTION_COUNT } from '@/src/utils/drag-auto-scroll';
import { remeasureAllDropZones } from '@/src/utils/drop-zone';

// Vertical constants (unchanged from phase 1)
const V_EDGE_ZONE = 80;
const V_MAX_SPEED = 14;

// Horizontal constants (gentler — shorter scroll distances)
const H_EDGE_ZONE = 60;
const H_MAX_SPEED = 10;

const REMEASURE_THROTTLE_MS = 100;

export function useDragAutoScroll() {
	// --- Outer (vertical) scroll ---
	const outerScrollRef = useAnimatedRef<Animated.ScrollView>();
	const scrollOffset = useSharedValue(0);
	const contentHeight = useSharedValue(0);
	const layoutHeight = useSharedValue(0);

	// --- Section (horizontal) scroll ---
	const sectionRef0 = useAnimatedRef<Animated.ScrollView>();
	const sectionRef1 = useAnimatedRef<Animated.ScrollView>();
	const sectionRef2 = useAnimatedRef<Animated.ScrollView>();
	const sectionRef3 = useAnimatedRef<Animated.ScrollView>();
	const sectionRefs = [sectionRef0, sectionRef1, sectionRef2, sectionRef3];

	// Auto-tracked horizontal offsets (UI thread, read-only for the tick)
	const sectionOffset0 = useScrollOffset(sectionRef0);
	const sectionOffset1 = useScrollOffset(sectionRef1);
	const sectionOffset2 = useScrollOffset(sectionRef2);
	const sectionOffset3 = useScrollOffset(sectionRef3);
	const sectionOffsets = [sectionOffset0, sectionOffset1, sectionOffset2, sectionOffset3];

	// Max horizontal offset per section (contentWidth - visibleWidth).
	// Written from JS thread via updateSectionMaxOffset callback.
	const sectionMaxOffsets = useSharedValue<number[]>(new Array(SECTION_COUNT).fill(0));

	// --- Drag state ---
	const touchX = useSharedValue(0);
	const touchY = useSharedValue(0);
	const dragSourceIndex = useSharedValue(-1);
	const remeasurePending = useSharedValue(false);

	const screenHeight = Dimensions.get('window').height;
	const screenWidth = Dimensions.get('window').width;

	// Throttled remeasure — runs on JS thread
	const doRemeasure = useCallback(() => {
		remeasureAllDropZones();
		setTimeout(() => {
			remeasurePending.value = false;
		}, REMEASURE_THROTTLE_MS);
	}, [remeasurePending]);

	// UI-thread tick — vertical + horizontal scroll
	const frameCallback = useFrameCallback(() => {
		'worklet';
		let scrolled = false;

		// 1. Vertical scroll (outer ScrollView)
		const vMaxOffset = Math.max(0, contentHeight.value - layoutHeight.value);
		const vSpeed = computeEdgeSpeed(touchY.value, screenHeight, V_EDGE_ZONE, V_MAX_SPEED);

		if (vSpeed !== 0) {
			const currentV = scrollOffset.value;
			const newV = Math.max(0, Math.min(vMaxOffset, currentV + vSpeed));
			if (Math.abs(newV - currentV) >= 1) {
				scrollTo(outerScrollRef, 0, newV, false);
				scrollOffset.value = newV;
				scrolled = true;
			}
		}

		// 2. Horizontal scroll (hovered target section)
		const srcIdx = dragSourceIndex.value;
		if (srcIdx >= 0) {
			const hSpeed = computeEdgeSpeed(touchX.value, screenWidth, H_EDGE_ZONE, H_MAX_SPEED);
			if (hSpeed !== 0) {
				for (let i = 0; i < SECTION_COUNT; i++) {
					if (i === srcIdx) continue;
					const m = measure(sectionRefs[i]);
					if (!m) continue;
					if (touchY.value >= m.pageY && touchY.value <= m.pageY + m.height) {
						const maxH = sectionMaxOffsets.value[i];
						if (maxH <= 0) break;
						const currentH = sectionOffsets[i].value;
						const newH = Math.max(0, Math.min(maxH, currentH + hSpeed));
						if (Math.abs(newH - currentH) >= 1) {
							scrollTo(sectionRefs[i], newH, 0, false);
							scrolled = true;
						}
						break; // only scroll one section
					}
				}
			}
		}

		// 3. Remeasure drop zones if anything scrolled
		if (scrolled && !remeasurePending.value) {
			remeasurePending.value = true;
			runOnJS(doRemeasure)();
		}
	}, false); // autostart: false

	const startAutoScroll = useCallback(() => {
		frameCallback.setActive(true);
	}, [frameCallback]);

	const stopAutoScroll = useCallback(() => {
		frameCallback.setActive(false);
		dragSourceIndex.value = -1;
	}, [frameCallback, dragSourceIndex]);

	const updateDragTouch = useCallback(
		(x: number, y: number) => {
			touchX.value = x;
			touchY.value = y;
		},
		[touchX, touchY]
	);

	const setDragSourceIndex = useCallback(
		(index: number) => {
			dragSourceIndex.value = index;
		},
		[dragSourceIndex]
	);

	const updateSectionMaxOffset = useCallback(
		(index: number, contentWidth: number, visibleWidth: number) => {
			const maxOffset = Math.max(0, contentWidth - visibleWidth);
			const current = sectionMaxOffsets.value.slice();
			current[index] = maxOffset;
			sectionMaxOffsets.value = current;
		},
		[sectionMaxOffsets]
	);

	// Captures outer scroll metrics on UI thread
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
		sectionRefs,
		setDragSourceIndex,
		updateSectionMaxOffset,
	};
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run types`
Expected: No errors

- [ ] **Step 3: Run bun tests (to verify nothing broke)**

Run: `bun test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-drag-auto-scroll.ts
git commit -m "feat(dnd): extend useDragAutoScroll with horizontal target-scroll (KII-12)"
```

---

### Task 3: Update grid to accept section ref and report scroll metrics

**Files:**

- Modify: `src/components/sortable-entity-grid.tsx`

The grid gains:

- `sectionScrollRef` prop — animated ref from the hook, used for `<Animated.ScrollView>`
  and passed to `Sortable.Grid` as `scrollableRef`
- `sectionIndex` prop — the grid's position in the section array
- `onSectionMaxOffset` prop — callback to report content/visible width
- `onDragSourceChange` prop — callback to report drag source index

- [ ] **Step 1: Update imports**

Add `type AnimatedRef` to the reanimated import:

```ts
import Animated, {
	useAnimatedRef,
	makeMutable,
	type SharedValue,
	type AnimatedRef,
} from 'react-native-reanimated';
```

- [ ] **Step 2: Add new props to interface**

Add to `SortableEntityGridProps`:

```ts
	/** Animated ref for this section's horizontal ScrollView (from useDragAutoScroll). */
	sectionScrollRef?: AnimatedRef<Animated.ScrollView>;
	/** Section index for auto-scroll registration. */
	sectionIndex?: number;
	/** Report horizontal scroll capacity for auto-scroll. Args: (index, contentWidth, visibleWidth). */
	onSectionMaxOffset?: (index: number, contentWidth: number, visibleWidth: number) => void;
	/** Report which section started a drag. Args: (index). */
	onDragSourceChange?: (index: number) => void;
```

- [ ] **Step 3: Destructure new props**

Update the function signature to destructure the new props:

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
	sectionScrollRef,
	sectionIndex,
	onSectionMaxOffset,
	onDragSourceChange,
}: SortableEntityGridProps) {
```

- [ ] **Step 4: Use section ref for ScrollView**

Replace:

```ts
const scrollViewRef = useAnimatedRef<Animated.ScrollView>();
```

with:

```ts
const ownScrollViewRef = useAnimatedRef<Animated.ScrollView>();
const scrollViewRef = sectionScrollRef ?? ownScrollViewRef;
```

- [ ] **Step 5: Add scroll metric reporting**

Add these handlers after the existing `handleScrollEnd` callback (around line 190):

```ts
const handleScrollViewLayout = useCallback(
	(e: { nativeEvent: { layout: { width: number } } }) => {
		if (sectionIndex != null && onSectionMaxOffset && scrollViewContentWidth.current > 0) {
			onSectionMaxOffset(
				sectionIndex,
				scrollViewContentWidth.current,
				e.nativeEvent.layout.width
			);
		}
		scrollViewVisibleWidth.current = e.nativeEvent.layout.width;
	},
	[sectionIndex, onSectionMaxOffset]
);

const scrollViewContentWidth = useRef(0);
const scrollViewVisibleWidth = useRef(0);

const handleContentSizeChange = useCallback(
	(w: number, _h: number) => {
		scrollViewContentWidth.current = w;
		if (sectionIndex != null && onSectionMaxOffset && scrollViewVisibleWidth.current > 0) {
			onSectionMaxOffset(sectionIndex, w, scrollViewVisibleWidth.current);
		}
	},
	[sectionIndex, onSectionMaxOffset]
);
```

Add `useRef` to the react import if not already there (it is — line 1).

- [ ] **Step 6: Report drag source on drag start**

In `handleSortableDragStart`, add after the existing `requestAnimationFrame` block
(inside the RAF callback, after `onDragStart?.(entity)`):

```ts
if (sectionIndex != null) {
	onDragSourceChange?.(sectionIndex);
}
```

- [ ] **Step 7: Wire ScrollView props**

Update the `<Animated.ScrollView>` (around line 368) to add the new handlers:

```tsx
<Animated.ScrollView
	ref={scrollViewRef}
	horizontal
	showsHorizontalScrollIndicator={false}
	contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
	onScrollEndDrag={handleScrollEnd}
	onMomentumScrollEnd={handleScrollEnd}
	onLayout={handleScrollViewLayout}
	onContentSizeChange={handleContentSizeChange}
>
```

- [ ] **Step 8: Update dependency arrays**

Add `onDragSourceChange` and `sectionIndex` to `handleSortableDragStart`'s dep array:

Current:

```ts
[entities, onDragStart, setIsFixed, isTransactionMode];
```

New:

```ts
[entities, onDragStart, setIsFixed, isTransactionMode, onDragSourceChange, sectionIndex];
```

- [ ] **Step 9: Commit**

```bash
git add src/components/sortable-entity-grid.tsx
git commit -m "feat(dnd): grid accepts section ref and reports scroll metrics (KII-12)"
```

---

### Task 4: Wire new props from home screen to grids

**Files:**

- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Destructure new hook values**

Update the hook destructuring:

```ts
const {
	outerScrollRef,
	scrollHandler,
	startAutoScroll,
	stopAutoScroll,
	updateDragTouch,
	sectionRefs,
	setDragSourceIndex,
	updateSectionMaxOffset,
} = useDragAutoScroll();
```

- [ ] **Step 2: Import SECTION_INDEX**

Add to imports:

```ts
import { SECTION_INDEX } from '@/src/utils/drag-auto-scroll';
```

- [ ] **Step 3: Update handleDragStart to set drag source**

```ts
const handleDragStart = useCallback(
	(entity: EntityWithBalance) => {
		setDraggedEntity(entity);
		setDragSourceIndex(SECTION_INDEX[entity.type]);
		startAutoScroll();
	},
	[setDraggedEntity, setDragSourceIndex, startAutoScroll]
);
```

- [ ] **Step 4: Pass new props to each grid**

Update all 4 `<SortableEntityGrid>` instances. Example for Income:

```tsx
<SortableEntityGrid
	title="Income"
	type="income"
	entities={income}
	onDragStart={handleDragStart}
	onDragEnd={handleDragEnd}
	onTap={handleTap}
	onAdd={handleAdd}
	dropZonesDisabled={!incomeVisible}
	dragBehavior={incomeEditMode ? 'reorder' : 'transaction'}
	editMode={incomeEditMode}
	onToggleEditMode={handleToggleIncomeEditMode}
	updateDragTouch={updateDragTouch}
	sectionScrollRef={sectionRefs[0]}
	sectionIndex={0}
	onSectionMaxOffset={updateSectionMaxOffset}
/>
```

For Accounts (`sectionIndex={1}`):

```tsx
	sectionScrollRef={sectionRefs[1]}
	sectionIndex={1}
	onSectionMaxOffset={updateSectionMaxOffset}
```

For Categories (`sectionIndex={2}`):

```tsx
	sectionScrollRef={sectionRefs[2]}
	sectionIndex={2}
	onSectionMaxOffset={updateSectionMaxOffset}
```

For Savings (`sectionIndex={3}`):

```tsx
	sectionScrollRef={sectionRefs[3]}
	sectionIndex={3}
	onSectionMaxOffset={updateSectionMaxOffset}
```

Note: `onDragSourceChange` is NOT passed because `setDragSourceIndex` is now called
from `handleDragStart` in the home screen (step 3). The grid's `onDragSourceChange`
prop is available for future use but not needed here — the home screen knows the
entity type from the drag start callback.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat(dnd): wire section refs and scroll metrics to grids (KII-12)"
```

---

### Task 5: Update grid drag test

**Files:**

- Modify: `src/components/__tests__/sortable-entity-grid-drag.test.tsx`

- [ ] **Step 1: Add new props to rendered grids**

In both `render()` calls, add the new optional props to prevent warnings:

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

No changes needed — the new props (`sectionScrollRef`, `sectionIndex`,
`onSectionMaxOffset`, `onDragSourceChange`) are all optional with no defaults
that would break behavior. The test should pass as-is.

- [ ] **Step 2: Verify component tests pass**

Run: `bun run test:component -- --testPathPattern sortable-entity-grid-drag`
Expected: Both existing tests PASS

- [ ] **Step 3: Commit (only if changes were needed)**

If no changes were needed, skip this commit.

---

### Task 6: Full gate — tests, typecheck, lint

- [ ] **Step 1: Run all bun tests**

Run: `bun test`
Expected: All pass

- [ ] **Step 2: Run typecheck**

Run: `bun run types`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: Clean (0 warnings, 0 errors)

- [ ] **Step 4: Fix any issues found, then commit**

If any step fails, fix the issue and create a new commit with the fix.
