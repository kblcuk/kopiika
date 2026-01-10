You are a senior principal mobile engineer and product designer building a small, offline-first personal finance iOS app using React Native and Expo (bare workflow).

This is a hobby project optimized for:

- simplicity
- iteration speed
- tactile, delightful UX
- clarity over accounting correctness

The app is NOT a bank, NOT an accountant, and NOT a budgeting enforcer.
It is a monthly planning vs reality dashboard for personal finances.

────────────────────────────────────────
CORE CONCEPT
────────────────────────────────────────

Everything in the app is an entity.
Money moves between entities via immutable transactions.
Plans define intent; transactions define reality.

Users primarily interact via drag-and-drop.

Core (expected) money flow:
Income → Account → Category / Saving
But money can move freely between any entities in any directions.

Overspending is allowed and visually highlighted.
No transaction is blocked.

────────────────────────────────────────
ENTITIES
────────────────────────────────────────

There are four entity types:

- income (e.g. Salary, Tax Return)
- account (bank accounts, cash)
- category (groceries, transport, coffee)
- saving (vacation, christmas, mortgage)

Entity model:

Entity {
id: string
type: 'income' | 'account' | 'category' | 'saving'
name: string
currency: string
icon?: string
color?: string
owner_id?: string
order: number
}

────────────────────────────────────────
PLANNING (INTENT)
────────────────────────────────────────

Planning supports both monthly budgets and all-time goals.

Plan model:

Plan {
id: string
entity_id: string
period: 'month' | 'all-time'
period_start: string // YYYY-MM (when plan was created/started)
planned_amount: number
}

Period semantics:

- period: 'month' = recurring monthly budget (for income, accounts, categories)
    - period_start indicates which month the budget applies to (e.g., '2026-01')
- period: 'all-time' = cumulative goal (for savings)
    - period_start indicates when the goal was created (e.g., '2026-01')

Plans are compared against derived actuals.
Plans never block transactions.

Balance calculation by entity type:

- Income & Categories: Use current month transactions only
- Accounts & Savings: Use all transactions (all-time balance/progress)

────────────────────────────────────────
TRANSACTIONS (REALITY)
────────────────────────────────────────

Transactions are immutable money movements.

Transaction model:

Transaction {
id: string
from_entity_id: string
to_entity_id: string
amount: number
currency: string
timestamp: number
note?: string
}

Balances are NEVER stored.
All balances are derived from transactions + time range.

────────────────────────────────────────
SQLITE SCHEMA (AUTHORITATIVE)
────────────────────────────────────────

Use SQLite for persistence.

Tables:

entities (
id TEXT PRIMARY KEY,
type TEXT NOT NULL,
name TEXT NOT NULL,
currency TEXT NOT NULL,
icon TEXT,
color TEXT,
owner_id TEXT,
"order" INTEGER NOT NULL
)

plans (
id TEXT PRIMARY KEY,
entity_id TEXT NOT NULL,
period TEXT NOT NULL,
period_start TEXT NOT NULL,
planned_amount REAL NOT NULL,
FOREIGN KEY(entity_id) REFERENCES entities(id)
)

transactions (
id TEXT PRIMARY KEY,
from_entity_id TEXT NOT NULL,
to_entity_id TEXT NOT NULL,
amount REAL NOT NULL,
currency TEXT NOT NULL,
timestamp INTEGER NOT NULL,
note TEXT,
FOREIGN KEY(from_entity_id) REFERENCES entities(id),
FOREIGN KEY(to_entity_id) REFERENCES entities(id)
)

Add indices on:

- transactions.timestamp
- transactions.from_entity_id
- transactions.to_entity_id
- plans.entity_id + plans.period_start (composite index for monthly plan lookups)

────────────────────────────────────────
STATE MANAGEMENT
────────────────────────────────────────

Use Zustand.

Store only:

- entities
- plans
- transactions
- UI state

All computed values (balances, remaining amounts, overspending) must be selectors.

Selectors must support:

- Time-scoped transaction filtering:
    - Income & Categories: current month only
    - Accounts & Savings: all-time
- planned vs actual
- remaining = planned - actual
- negative remaining allowed

────────────────────────────────────────
MAIN SCREEN UI
────────────────────────────────────────

Single primary screen showing current month for budgets, all-time for balances/goals.

Four sections:

- Income (can be collapsed / almost hidden) - shows current month
- Accounts · Total - shows all-time balance
- Categories - shows current month
- Savings · Goal - shows all-time progress

Each item shows:

- icon + name
- actual amount (current month for income/categories, all-time for accounts/savings)
- planned amount (monthly budget for income/categories, cumulative goal for savings)
- a progress bar showing relation between actual and planned

Formatting:

- Initially show: remaining / planned (e.g. 1000 / 1000)
- Overspend example: -25 / 1000
- Negative values are visually emphasized, never hidden

Section titles indicate time scope:

- "Income", "Categories" - implicitly current month
- "Accounts · Total" - explicitly all-time
- "Savings · Goal" - explicitly all-time

────────────────────────────────────────
INTERACTION RULES
────────────────────────────────────────

Drag-and-drop is the primary interaction.

Rules:

- Any entity can be dragged onto any other
- Drop opens a modal

Modal behavior:

- Account → Category: empty amount input (cursor focused)
- Account → Saving: empty input + optional “remaining planned” shortcut
- Income → Account: suggest remaining planned income
- Overspending is allowed
- No validation blocks transactions

────────────────────────────────────────
EXPORT
────────────────────────────────────────

Provide CSV export for:

- entities
- plans
- transactions

No cloud sync required.

────────────────────────────────────────
VISUAL LANGUAGE & AESTHETICS (IMPORTANT)
────────────────────────────────────────

Avoid generic “AI slop” design.
This app should feel intentionally designed, not auto-generated.

Guidelines:

Typography:

- Avoid Inter, Roboto, system fonts
- Choose distinctive fonts that convey calm precision or quiet confidence
- Prefer one strong typeface over many

Color & Theme:

- Commit to a cohesive theme
- Use a dominant base color with sharp accents
- Avoid pastel soup and purple-on-white gradients
- Draw inspiration from IDE themes, print design, or physical objects (paper, ledgers, envelopes)

Motion:

- Use animation sparingly but intentionally
- Favor meaningful transitions over constant motion
- Drag-and-drop should feel weighty and responsive

Layout:

- Flat lists with strong hierarchy
- Large tap targets
- Breathing room
- Avoid card overload

Character:

- This is a personal tool, not fintech marketing
- Calm, confident, human
- No gamification tropes

────────────────────────────────────────
ACCESSIBILITY
────────────────────────────────────────

The app must be accessible, particularly for dyslexia and visual clarity.

Contrast Requirements:

- All text must meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- Primary text (ink.DEFAULT) on paper backgrounds: minimum 7:1
- Secondary text (ink.light) on paper backgrounds: minimum 4.5:1
- Interactive elements must be clearly distinguishable from non-interactive

Color Usage Rules:

Text:

- Primary content: ink.DEFAULT (#1A1410)
- Secondary labels: ink.light (#3D3426)
- Tertiary/hints: ink.muted (#6B5D4A)
- NEVER use ink.muted on paper.DEFAULT - only on paper.50 or darker

Backgrounds:

- Main surface: paper.100 (#F8F4ED)
- Highlights/cards: paper.50 (#FFFEFA)
- Borders: border.DEFAULT (#D4C8B3)
- Subtle dividers: border.light (#EBE3D5)
- Disabled states: paper.300 (#D4C8B3)

Accents (for emphasis and interaction):

- Primary actions/income: accent.DEFAULT (#D4652F)
- Overspending/warnings: negative.DEFAULT (#C23030)
- Categories/success: positive.DEFAULT (#2F7D4A - green)
- Savings goals: info.DEFAULT (#2B5F8A - blue)
- These must always be used on paper.50 or paper.100 for sufficient contrast

Entity Type Color-Coding:

To improve visual distinction, each entity type uses specific background tints and icon colors:

- Income entities:
    - Background: bg-accent/10 (soft terracotta tint)
    - Icon color: #D4652F (accent.DEFAULT)
- Account entities:
    - Background: bg-paper-300 (neutral beige)
    - Icon color: #6B5D4A (ink.muted)
- Category entities:
    - Background: bg-positive/10 (soft green tint)
    - Icon color: #2F7D4A (positive.DEFAULT - green)
- Saving entities:
    - Background: bg-info/10 (soft blue tint)
    - Icon color: #2B5F8A (info.DEFAULT - blue)

Progress rings maintain overspent/underspent color logic (not type-specific):

- Healthy progress: positive.DEFAULT (green)
- Warning: warning.DEFAULT (amber)
- Overspent: negative.DEFAULT (red)

Dyslexia Considerations:

- High contrast between text and background
- Clear color differentiation between interactive states
- Avoid red/green as the only distinguishing factor
- Use Space Grotesk font (already configured) - clean, geometric, dyslexia-friendly
- Generous spacing and tap targets (minimum 44px)
- Clear visual hierarchy with size/weight, not just color

Testing:

Before shipping any UI:

- Verify contrast ratios using a contrast checker
- Test with reduced visual acuity (blur test)
- Ensure functionality is clear without relying solely on color

────────────────────────────────────────
TECH STACK
────────────────────────────────────────

- Bun
- React Native
- Expo (bare workflow)
- lucide-react for icons
- NativeWind for styling
- Zustand
- SQLite
- react-native-gesture-handler
- react-native-reanimated
- Victory charts (later)

────────────────────────────────────────
TASK BREAKDOWN (FOLLOW THIS ORDER)
────────────────────────────────────────

1. Project scaffolding
    - Expo bare setup
    - Folder structure
    - Basic navigation

2. SQLite setup
    - Schema creation
    - Migration handling
    - Basic CRUD helpers

3. State layer
    - Zustand store
    - Entity, Plan, Transaction slices
    - Derived selectors

4. Static Main Screen
    - Layout only
    - Dummy data
    - Visual language established early

5. Drag-and-drop
    - Entity drag sources
    - Drop targets
    - Modal creation

6. Transaction creation
    - Persist to SQLite
    - Update state
    - Recompute derived values

7. CSV export
    - Simple, explicit exports

DO NOT implement:

- Authentication
- Sync
- Recurring transactions
- Budget enforcement
- Multi-period planning UI

────────────────────────────────────────
DELIVERABLE
────────────────────────────────────────

Produce a working prototype where:

- Users can define entities and plans
- Drag entities to create transactions
- See planned vs actual amounts update immediately
- Overspending is visible and allowed

Optimize for clarity, simplicity, and joy of use.
