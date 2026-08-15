# PRD: Global vs. Scenario-Scoped Events & Rules

## Background
The runway app currently supports multiple financial scenarios, each with its own one-off events and saving rules. Today, every item created lives inside the scenario it was added to — meaning something that logically applies to *all* scenarios (e.g. a known upcoming expense, or a savings rule that should hold regardless of which scenario you're modeling) has to be manually duplicated into each one. This is error-prone and doesn't reflect how the user actually thinks about these items.

## Problem
1. There's no way to say "this rule/event applies no matter which scenario I'm looking at."
2. Even if scope existed, nesting a "global" item inside a specific scenario's UI is confusing — the user has to remember which scenario they first created it in just to find and edit it.

## Goals
- Let a one-off event or saving rule be marked as **Global** (applies to all scenarios) or **Scenario-specific** (applies only to the scenario it belongs to).
- Give global items a first-class home, independent of any single scenario, so they can be viewed/edited without entering a scenario.
- Ensure scenario projections correctly merge scenario-specific items with global items.
- Allow a global item's amount/value to be overridden for a single scenario without forking the whole item.

## Non-goals
- No support for "applies to a subset of scenarios" (e.g. scenarios A and C but not B) in this iteration — it's all-or-one.
- No versioning/history of changes to global rules in this iteration.

## Data model
Add a `scope` field to both one-off events and saving rules:
- `scope: "global" | "scenario"`
- `scenario_id`: null when `scope = "global"`; required when `scope = "scenario"`

To support per-scenario overrides of a global item's amount/value, add a separate `overrides` table:
- `override_id`
- `global_item_id` (the global event/rule being overridden)
- `scenario_id` (the scenario this override applies to)
- `value` (the overriding amount/value for this scenario)

An override does not fork the item into a new object — it's a scenario-specific value that supersedes the global default only within that one scenario. All other fields (name, timing, recurrence, etc.) still come from the global item.

## UX design

### Top-level structure
- New top-level section: **Global Events & Rules** — a dedicated list/tab, sitting alongside (not inside) the scenario list.
- Each scenario retains its own **Scenario Events & Rules** list for scenario-specific items.

### Creating an item
- Add/edit form includes a scope toggle: **"This scenario only"** vs **"All scenarios."**
- If "All scenarios" is selected, the item is created directly into the Global list, regardless of which scenario the user was viewing when they created it.

### Viewing a scenario
- The scenario's projection view shows a **merged list** of scenario-specific + global items that affect it.
- Each item is labeled with a badge: **Global** or **Scenario**.
- Global items shown here are read-only references — clicking one opens the global editor (same object, not a copy).

### Editing
- Editing a global item — whether opened from the Global list or referenced from within a scenario — always edits the single shared object.
- Editing propagates immediately to all scenarios that reference it (single source of truth; no forking).
- If a user wants a variant that differs per scenario, they have two options:
  - **Override the amount/value only** (same rule identity, different number for this scenario) — done inline from the scenario's merged view, without leaving the scenario. The item keeps its Global badge but shows an "overridden" indicator (e.g. "Global · overridden here").
  - **Fully duplicate the item** into a scenario-specific copy, when more than just the amount needs to diverge — this remains a deliberate, visible action.

## Calculation logic
When computing a scenario's projection, include:
- All items where `scope = "scenario"` and `scenario_id` matches the scenario, **plus**
- All items where `scope = "global"` — using the override `value` for that scenario if one exists in the `overrides` table, otherwise the global default value.

## Open questions
- Do we need an audit trail if a global edit unexpectedly changes multiple scenarios' projections at once?

## Deletion behavior
- If a global item is deleted, its per-scenario overrides are **not** deleted automatically — they are flagged for review so the user can see which scenarios had an override tied to the now-deleted item and decide what to do with each.

## Success criteria
- User can mark an event/rule as global at creation or via edit, without needing to be inside a specific scenario to do so.
- Global items are visible and editable from one central place.
- Scenario projections correctly reflect the merge of scenario + global items with no duplication needed.
- User can override a global item's amount/value for a single scenario without forking the whole item, and the override is clearly indicated in the UI.
