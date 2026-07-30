# CAD Edit Engine Task 3 Report

## RED

- Added `modules/cad-edit/tests/history.test.ts` before the history implementation.
- Confirmed the focused test failed because `createCadEditHistory` was not exported.
- Added the lineage-capacity boundary test and confirmed it failed when a two-target command was incorrectly counted as two commands.

## GREEN

- Added immutable transaction history with preview, apply, undo, redo, UI entries, committed transaction lookup, and save-state retrieval.
- Previews are history-owned immutable snapshots; repeated, stale, or foreign previews cannot commit state.
- Apply, undo, and redo always advance the revision; undo restores prior content and redo restores committed content.
- New edits after undo mark the redo branch `superseded` and clear redo availability.
- UI entries retain the newest 100 transactions by default. Active Save As lineage is kept separately and rejects the next edit at 10,000 commands with `EDIT_LINEAGE_LIMIT_REACHED`.
- Added public history exports and structured edit error codes. The existing root `test:edit` script already covered the requested command and required no change.

## Boundary cases

- Preview state isolation and repeated-preview safety.
- Defensive snapshots from `current`, `apply`, committed transactions, entries, and save state.
- Stale revision rejection for apply/undo/redo and duplicate transaction rejection.
- `applied` -> `undone` -> `applied` and `undone` -> `superseded` status transitions.
- Save-state document/revision rejection, source-revision-zero requirement, active-only lineage, and command-not-change capacity counting.

## Tests

- `node --import tsx --test modules/cad-edit/tests/history.test.ts` — 8 passed.
- `npm run test:edit` — 27 passed.
- `npx tsc -p modules/cad-edit/tsconfig.json --noEmit` — passed.
- `npx tsc -p tsconfig.json --noEmit` — passed.
- `npm run verify` — passed: 170 Node tests, 11 .NET tests, and frontend production build.

## Commit

- Planned message: `feat: add CAD edit undo and redo`

## Concerns

- Save state intentionally contains only the active branch and never an undone or superseded transaction. Its transaction snapshots preserve actual monotonic revisions, while active content is verified as a contiguous replay chain independent of those revision numbers.
