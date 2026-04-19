# SheetHeader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `SheetHeader` component (grabber pill + close button) and apply it to both transparent bottom sheets, plus add backdrop dimming and top border for visual separation.

**Architecture:** New `SheetHeader` renders grabber + X button, receives `onClose` prop. Each transparent modal (`reservation-modal`, `whats-new-modal`) adds the header, a `border-t`, backdrop dimming, and adjusts padding.

**Tech Stack:** React Native, NativeWind/Tailwind, lucide-react-native (X icon), Jest + RNTL

---

## File Map

| Action | File                                                  | Responsibility                                        |
| ------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Create | `src/components/sheet-header.tsx`                     | Shared header: grabber pill + X close button          |
| Create | `src/components/__tests__/sheet-header.test.tsx`      | Unit tests for SheetHeader                            |
| Modify | `src/components/reservation-modal.tsx`                | Add SheetHeader, border, backdrop dim, adjust padding |
| Modify | `src/components/whats-new-modal.tsx`                  | Add SheetHeader, border, backdrop dim, adjust padding |
| Verify | `src/components/__tests__/reservation-modal.test.tsx` | Ensure existing tests still pass                      |
| Verify | `src/components/__tests__/whats-new-modal.test.tsx`   | Ensure existing tests still pass                      |

---

### Task 1: SheetHeader Component

**Files:**

- Create: `src/components/__tests__/sheet-header.test.tsx`
- Create: `src/components/sheet-header.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/__tests__/sheet-header.test.tsx
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SheetHeader } from '../sheet-header';

describe('SheetHeader', () => {
	const mockOnClose = jest.fn();

	beforeEach(() => jest.clearAllMocks());

	it('renders a grabber pill', () => {
		const { getByTestId } = render(<SheetHeader onClose={mockOnClose} />);
		expect(getByTestId('sheet-grabber')).toBeTruthy();
	});

	it('renders a close button that calls onClose', () => {
		const { getByTestId } = render(<SheetHeader onClose={mockOnClose} />);
		fireEvent.press(getByTestId('sheet-close'));
		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --testPathPattern="sheet-header" --no-coverage`
Expected: FAIL — module `../sheet-header` not found

- [ ] **Step 3: Write the SheetHeader component**

```tsx
// src/components/sheet-header.tsx
import { View, Pressable } from 'react-native';
import { X } from 'lucide-react-native';

import { colors } from '@/src/theme/colors';

interface SheetHeaderProps {
	onClose: () => void;
	title?: string;
}

export function SheetHeader({ onClose }: SheetHeaderProps) {
	return (
		<View className="relative items-center pb-2 pt-3">
			{/* Grabber pill */}
			<View testID="sheet-grabber" className="h-1 w-9 rounded-full bg-paper-300" />

			{/* Close button */}
			<Pressable
				testID="sheet-close"
				onPress={onClose}
				hitSlop={20}
				className="absolute right-3 top-2 h-7 w-7 items-center justify-center rounded-full bg-paper-200"
			>
				<X size={14} color={colors.ink.muted} />
			</Pressable>
		</View>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- --testPathPattern="sheet-header" --no-coverage`
Expected: PASS — both tests green

- [ ] **Step 5: Commit**

```
feat(sheet): add SheetHeader component with grabber pill and close button (KII-88)
```

---

### Task 2: Integrate SheetHeader into ReservationModal

**Files:**

- Modify: `src/components/reservation-modal.tsx`
- Verify: `src/components/__tests__/reservation-modal.test.tsx`

- [ ] **Step 1: Add SheetHeader import and backdrop dimming**

In `reservation-modal.tsx`, add the import at the top alongside existing imports:

```tsx
import { SheetHeader } from './sheet-header';
```

Change the backdrop `<Pressable>` (line 102) from:

```tsx
<Pressable className="flex-1" onPress={handleCancel} />
```

to:

```tsx
<Pressable className="flex-1 bg-black/25" onPress={handleCancel} />
```

- [ ] **Step 2: Add border-t and SheetHeader to the sheet container**

Change the `KeyboardAwareScrollView` className (line 108) from:

```tsx
className = 'overflow-hidden rounded-t-3xl bg-paper-50';
```

to:

```tsx
className = 'overflow-hidden rounded-t-3xl border-t border-paper-300 bg-paper-50';
```

Add `<SheetHeader onClose={handleCancel} />` as the first child inside the `KeyboardAwareScrollView`, before the `{/* Header: account → saving */}` comment (line 115).

- [ ] **Step 3: Reduce top padding**

In `contentContainerStyle` (lines 109-113), change `paddingTop` from `24` to `0` (the SheetHeader provides its own vertical spacing):

```tsx
contentContainerStyle={{
	paddingBottom: Math.max(insets.bottom, 16),
	paddingHorizontal: 24,
	paddingTop: 0,
}}
```

- [ ] **Step 4: Run existing reservation-modal tests**

Run: `bun run test -- --testPathPattern="reservation-modal" --no-coverage`
Expected: PASS — all 4 existing tests green (numeric input, create, update, clear)

- [ ] **Step 5: Commit**

```
feat(sheet): add SheetHeader and backdrop dimming to reservation modal (KII-88)
```

---

### Task 3: Integrate SheetHeader into WhatsNewModal

**Files:**

- Modify: `src/components/whats-new-modal.tsx`
- Verify: `src/components/__tests__/whats-new-modal.test.tsx`

- [ ] **Step 1: Add SheetHeader import and backdrop dimming**

In `whats-new-modal.tsx`, add the import:

```tsx
import { SheetHeader } from './sheet-header';
```

Change the backdrop `<Pressable>` (line 50) from:

```tsx
<Pressable testID="whats-new-backdrop" className="flex-1" onPress={onClose} />
```

to:

```tsx
<Pressable testID="whats-new-backdrop" className="flex-1 bg-black/25" onPress={onClose} />
```

- [ ] **Step 2: Add border-t and SheetHeader to the sheet container**

Change the content `<View>` className (line 53) from:

```tsx
className = 'rounded-t-3xl bg-paper-50 px-6 pb-4 pt-6';
```

to:

```tsx
className = 'rounded-t-3xl border-t border-paper-300 bg-paper-50 px-6 pb-4 pt-2';
```

Note: `pt-6` becomes `pt-2` since `SheetHeader` provides top spacing.

Add `<SheetHeader onClose={onClose} />` as the first child inside this `<View>`, before the `{/* Header */}` comment (line 56).

- [ ] **Step 3: Run existing whats-new-modal tests**

Run: `bun run test -- --testPathPattern="whats-new-modal" --no-coverage`
Expected: PASS — all 5 existing tests green

- [ ] **Step 4: Commit**

```
feat(sheet): add SheetHeader and backdrop dimming to whats-new modal (KII-88)
```

---

### Task 4: Final Gate

- [ ] **Step 1: Run full test suite**

Run: `bun run test --no-coverage`
Expected: All tests pass

- [ ] **Step 2: Run linter**

Run: `bun run lint`
Expected: No errors

- [ ] **Step 3: Run type check**

Run: `bun run types`
Expected: No errors

- [ ] **Step 4: Run formatter**

Run: `bun run format`
Expected: Files formatted (or already clean)
