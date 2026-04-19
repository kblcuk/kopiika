# SheetHeader Component (KII-88)

## Problem

The savings reservation bottom sheet (`reservation-modal.tsx`) uses `transparent` mode with
a manual backdrop, but lacks any visual affordance indicating it's a separate dismissable layer.
The sheet's `bg-paper-50` background blends into the main screen's `bg-paper` background, and
there's no grabber handle, close button, or backdrop dimming. Users don't realize they can
dismiss it.

The same issue affects `whats-new-modal.tsx`, the only other transparent bottom sheet.

## Solution: `SheetHeader` component

A shared, reusable header component that provides three visual signals:

1. **Grabber pill** — centered drag-indicator affordance
2. **Close button** — explicit X on a circular background, top-right
3. **Top border** — `border-paper-300` on the sheet container for edge separation

Additionally, transparent bottom sheets gain a **dimmed backdrop** (`bg-black/25`) so the
sheet visually floats above the content behind it.

### Component: `src/components/sheet-header.tsx`

```tsx
interface SheetHeaderProps {
	onClose: () => void;
	title?: string; // reserved for future use
}
```

**Renders:**

- A centered grabber pill: 36×4px, `rounded-full`, `bg-paper-300`
- An X close button: 28×28px circle, `bg-paper-200`, `X` icon (lucide) at 14px in `ink.muted`,
  positioned absolute top-right with `hitSlop={20}`
- Total height: ~40px (10px top padding + 4px pill + remaining space for close button alignment)

**Does not render:**

- Backdrop/overlay (each modal controls its own)
- Title (prop accepted but not rendered in v1 — ready for future header-bar use)

### Changes to `reservation-modal.tsx`

1. Import and render `<SheetHeader onClose={handleCancel} />` as first child inside
   the `KeyboardAwareScrollView`
2. Add `border-t border-paper-300` to the scroll view's `className`
3. Change the backdrop `<Pressable>` to include `bg-black/25` for dimming
4. Reduce `paddingTop` in `contentContainerStyle` from 24 to 12 (header provides its own
   top spacing)

### Changes to `whats-new-modal.tsx`

1. Import and render `<SheetHeader onClose={onClose} />` as first child inside the
   content `<View>`
2. Add `border-t border-paper-300` to the container's `className`
3. Wrap existing `<Pressable>` backdrop with `bg-black/25`
4. Reduce `pt-6` to `pt-2` (header handles top spacing)

### Visual tokens used

| Element      | Token       | Value              |
| ------------ | ----------- | ------------------ |
| Grabber bg   | `paper.300` | `#D4C8B3`          |
| Close bg     | `paper.200` | `#EBE3D5`          |
| Close icon   | `ink.muted` | `#6B5D4A`          |
| Top border   | `paper.300` | `#D4C8B3`          |
| Backdrop dim | `black/25`  | `rgba(0,0,0,0.25)` |

### Test plan

- Verify grabber pill renders centered at top of reservation modal
- Verify X button calls `onClose` when pressed
- Verify backdrop dimming is visible behind the sheet
- Verify top border creates visual separation from screen content
- Verify whats-new modal also renders the header correctly
- Verify existing reservation-modal tests still pass (submit, clear, expression input)

## Not in scope

- Shadow-based separation (revisit later as a design language decision)
- Bundling the backdrop inside `SheetHeader`
- Converting `pageSheet` modals to transparent bottom sheets
- Title rendering (prop wired but unused in v1)
