# Task 2 review — 4928edf..2ef01b2

## Verdict

**Not ready to merge: 1 P1 correctness failure and 1 P2 accessibility gap.**

The implementation has the intended ownership split: `WorkspaceSidebar` is the
composition/tab owner, each navigation feature owns its presentation state, the
skill client is typed through `@dwg/contracts`, and the module-boundary test
passes. Project/session/skill focused browser coverage also passes. The two
checked-in captures were inspected: desktop shows the requested drawing →
layouts/layers hierarchy and narrow shows a readable skills drawer with scrim.

### P1 — Project layer metadata discards available deterministic evidence

`CadLayerIndexItem` provides `visible`, `frozen`, `locked`, and `color`; the
checked-in drawing provides concrete values for every one (for example layer
`0`: visible `true`, frozen `false`, locked `false`, color `7`).
`ProjectNavigator` instead initializes visibility exclusively from the local
hidden-layer set and renders lock/color as the literal unavailable marker.
Consequently a source-hidden/frozen/locked layer is presented as visible and
unlocked, and a known color is hidden. This violates the task's actual
eye/lock/color/count evidence requirement. The focused test enshrines the
incorrect unavailable lock/color expectation.

- Evidence: `apps/workspace/src/features/project-navigation/ProjectNavigator.tsx:66-84`; `packages/contracts/src/cad.ts:29-36`; `apps/workspace/public/data/export_sample.index.json`.
- Required follow-up: render source visibility/frozen/lock/color truth (and
  reconcile it with user visibility overrides); update the test to assert the
  real fixture values rather than unavailable placeholders. Do not replace this
  with a weaker presence-only assertion.

### P2 — Narrow overlay is not keyboard-dismissible or focus-managed

The narrow sidebar is a scrim-backed overlay, but opening it neither moves
focus into the drawer nor records/restores the menu trigger. `Escape` only
closes settings, notifications, and artifact maximization; it leaves the
sidebar open. The visible close button and scrim work with a pointer, but the
required focus/dismissal path is incomplete.

- Evidence: `apps/workspace/src/app/WorkspaceSidebar.tsx:68-94`; `apps/workspace/src/app/useWorkspaceControls.ts:98-110`; `apps/workspace/src/app/styles.css:362-381`.
- Required follow-up: give the overlay dialog semantics, focus its close/tab
  target on open, close it on `Escape`, and return focus to the menu trigger;
  add a narrow keyboard E2E assertion.

## Verified requirements

- Tab roles, roving tab stop, Arrow/Home/End focus movement, and persisted
  tab choice: present; focused E2E passes.
- Sticky search and separate project/session scroll containers: present;
  focused E2E passes.
- Drawing/layout/layer hierarchy, layer toggle behavior, count and native long
  name tooltip: present. The metadata-truth defect above remains.
- Today/Earlier session grouping: present.
- Skills typed through `@dwg/contracts`, loading/empty/error states,
  compatibility, permissions, and recent status: present.
- No cross-feature imports in the new feature folders; architecture boundary
  suite passes.

## Full E2E failure classification

`npm run test:e2e` reproduced **12 failures, 31 passes**, not 13. The count is
recorded as observed; a thirteenth failure was not reproducible in this
checkout.

| Failure(s) | Classification | Required action |
| --- | --- | --- |
| `geometry-fidelity` explorer schema | Stale selector | Assert the schema value in `.project-navigation-footer`, preserving the `v0.2` assertion. |
| `layer-visibility` accessible name | Stale selector/localization | Assert `Hide layer 0`/`Show layer 0` (or adopt one product locale consistently), retaining the entity hide/restore assertions. |
| `three-panel` project/conversation/artifact order | Stale sidebar accessible-name selector | Select `Workspace navigation`; retain the ordering assertion. |
| `three-panel` narrow overlay | Stale accessible-name selector **plus P2 gap** | Update selector to the approved label, then add Escape/focus-return coverage and implement it. |
| `workspace-refinement` Recents scroll | Obsolete structure assertion | Replace with the two independent-scroll assertions required by Task 2; do not test for a removed Recents button. |
| `workspace-refinement` old sidebar hierarchy | Obsolete structure assertion | Replace old New-chat/Search/Project/Recents selectors with semantic tab/project/session expectations; the dedicated Task-2 spec is the starting point. |
| `workspace` loaded 1280/1440/1920 (3) | Obsolete `Sample review` copy assertion | Assert actual drawing hierarchy/source display name instead; preserve viewer, entity-count, no-error, and fit checks. |
| `workspace` real-inspection screenshot | Approved UI baseline stale | Regenerate only after the P1 fix and visual comparison; preserve zero-diff screenshot policy. |
| `workspace` OAuth screenshot | Approved UI baseline stale | Regenerate only after the P1 fix and visual comparison; preserve zero-diff screenshot policy. |
| `three-panel` artifact keyboard resize | Real failing behavior, but not introduced by this commit | Reproduces alone (606px remains 606px after ArrowLeft). None of `CadArtifactPanel`, `useWorkspaceControls`, or artifact sizing CSS changed in this range. Triage separately; do not weaken its width-growth assertion. |

The rows account for 12 failures: three loaded-viewport instances count as
three; the two screenshot tests as two.

## Commands run

```powershell
$env:DWG_FRONTEND_PORT='4308'
$env:DWG_GATEWAY_PORT='4452'
npm run test:e2e                         # 31 passed, 12 failed
npm run test:e2e -- sidebar-navigation.spec.ts  # 4 passed
npm --workspace @click-around/workspace run typecheck  # passed
node --import tsx --test modules/cad-runtime/tests/architecture/module-boundaries.test.ts  # 8 passed
```

No product code, tests, snapshots, or baselines were changed during this
review; this file is the only review artifact added.

## Resolution report

| Review failure | Resolution | Regression evidence |
| --- | --- | --- |
| P1 layer metadata truth | Render `visible`, `frozen`, `locked`, and ACI color from `CadLayerIndexItem`; compute effective visibility as source-visible, not frozen, and not user-hidden; disable source-hidden/frozen toggles. | `sidebar-navigation`: actual fixture metadata and source-hidden/frozen/null cases. |
| P2 narrow overlay keyboard path | Give the overlay dialog/modal semantics, focus its close button on open, close on Escape, and restore the exact menu trigger; preserve close-button and scrim behavior. | `three-panel-workspace`: focus, Escape, trigger restoration, reopen, and scrim close. |
| Artifact ArrowLeft resize | Start new preferences at the minimum artifact width so the widened sidebar does not clamp the artifact at its maximum on first render; retain existing width bounds and 500px conversation protection. | `three-panel-workspace` keyboard growth; workspace preference clamp unit tests. |
| Stale explorer/schema/layer selectors | Move assertions to approved semantic navigation and layer controls while retaining schema, entity hide/restore, and count evidence. | `geometry-fidelity`, `layer-visibility`. |
| Obsolete three-panel/refinement structure | Select the approved navigation landmark and assert current project/session tabs, hierarchy, independent scrolling, order, and width behavior. | `three-panel-workspace`, `workspace-refinement`. |
| Obsolete loaded-workspace copy | Assert the actual drawing hierarchy and source name while retaining viewer, entity count, fit, no-error, and zero-diff checks. | Three loaded viewport cases in `workspace`. |
| Approved UI baseline drift | Regenerate only after P1/P2 and resize fixes, then inspect the focused desktop and narrow captures. | Updated `workspace` snapshots and `docs/ui-captures/sidebar-*.png`. |

Final verification:

```powershell
$env:DWG_FRONTEND_PORT='4309'
$env:DWG_GATEWAY_PORT='4453'
npm run verify:all
# Node 266 passed; .NET 11 passed; frontend build passed; E2E 44 passed, 0 failed
```
