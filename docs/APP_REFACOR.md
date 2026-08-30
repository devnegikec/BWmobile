## Current state (what I found)

- **~11k LOC** in src; no lint/format tooling (package.json has no `lint`/`format` scripts, no ESLint/Prettier config).
- tsconfig.json already has `"strict": true` and a `@/*` path alias — but **0 imports use it**, and there's **no `babel.config.js`/`metro.config.js`**, so the alias isn't actually wired for the bundler yet.
- index.ts is 752 lines and has **`AsnOrder` declared twice (lines 516 & 608)** — TypeScript silently merges them.
- Large files worth decomposing: PutawayScreen.tsx (877), AssignBinScreen.tsx (750), `types/index.ts` (752), PickScreen.tsx (640), QsealCascadeScreen.tsx (635), inboundStore.ts (620), SummaryView.tsx (563), QrScanner.tsx (473).

## Guiding principles

1. **No business logic changes** — only moves, renames, extractions, and config.
2. **Every task = one small PR**, independently mergeable and reviewable.
3. **Verify after each task** with `npx tsc --noEmit` (and later `npm run lint`).

---

## Phase 0 — Tooling baseline (highest value)

These make your PR reviewer's comments (like `no-await-in-loop`) catchable locally *before* the PR.

- **T0.1** Add ESLint + Prettier configs (`.eslintrc`/`eslint.config.js`, `.prettierrc`, `.editorconfig`) with the rules your reviewer already uses (`no-await-in-loop`, `react-hooks/exhaustive-deps`, etc.). *Config only — no source changes.*
- **T0.2** Add package.json scripts: `lint`, `lint:fix`, `format`, `typecheck` (`tsc --noEmit`).
- **T0.3** Run `lint` once, record the existing violations as a separate baseline commit (do **not** auto-fix everything at once — fixes go in later tasks).

## Phase 1 — Type system organization

- **T1.1** Split `types/index.ts` into `types/common.ts`, `types/auth.ts`, `types/inbound.ts`, `types/putaway.ts`, `types/pick.ts`, `types/qseal.ts`; keep `types/index.ts` as a re-export barrel. *Pure file moves + import updates.*
- **T1.2** Merge the duplicated `AsnOrder` (lines 516 & 608) into one explicit interface. *Behavior-neutral; resolves declaration merging.*

## Phase 2 — Path alias & import hygiene

- **T2.1** Wire `@/*` for Metro/Expo (enable `experiments.tsconfigPaths` in app.json, or add the minimal `babel`/`metro` config if the SDK needs it). Verify with one import before proceeding.
- **T2.2–T2.6** Migrate relative imports to `@/…` **one folder per PR** (`api/`, `store/`, `hooks/`, `components/`, `screens/`). Mechanical, zero-logic.

## Phase 3 — Decompose large screens/components

Pure extraction — move JSX sub-views and `StyleSheet` blocks out; no prop/behavior changes. **One file per PR.**

- **T3.1** PutawayScreen.tsx → child components + `PutawayScreen.styles.ts`.
- **T3.2** AssignBinScreen.tsx → same pattern.
- **T3.3** PickScreen.tsx → same pattern.
- **T3.4** QsealCascadeScreen.tsx → same pattern. (DONE)
- **T3.5** QrScanner.tsx (473) → split the modal/camera/manual-entry variants.
- **T3.6** SummaryView.tsx (563) → extract the rejection/group tables.

## Phase 4 — Store & hooks cleanup

- **T4.1** Extract the shared backend-error mapper (`getBackendErrorMessage` in inboundStore.ts and the near-identical `getErrorMessage` helpers in screens) into `src/utils/errors.ts`. *Same output, one source of truth.*
- **T4.2** Extract duplicated `Alert`-based confirmation patterns into a small `src/utils/dialogs.ts` (only if truly identical — otherwise skip).

## Phase 5 — Constants & magic values

- **T5.1** Extract hardcoded literals into `src/constants/`: status strings (`'OPEN'`, `'CLOSED'`, `'pending'`, `'confirmed'`, …), storage keys (`'access_token'`, …), route/endpoint path fragments. *String substitution only.*

## Phase 6 — Conventions & docs

- **T6.1** Add `docs/ARCHITECTURE.md` (folder conventions, data flow: screen → hook → store → service).
- **T6.2** Add a short `CONTRIBUTING.md` (lint/format/typecheck gates, PR size expectations).

## Phase 7 — Verification gates

- **T7.1** Make `typecheck` + `lint` pass cleanly; optionally add a pre-commit hook (`lint-staged`) in a final PR.
- **T7.2** Smoke-test the app once (login → inbound → putaway) to confirm no behavior change.

---

### Recommended order & effort

| Phase | Effort | Risk | PRs |
|---|---|---|---|
| 0 (tooling) | S | Low | 1–2 |
| 1 (types) | S–M | Low | 2 |
| 2 (alias) | S | Low | 5 small |
| 3 (decompose) | M | Low–Med | 6 |
| 4 (store/hooks) | S | Low | 2 |
| 5 (constants) | S | Low | 1 |
| 6 (docs) | S | None | 2 |
| 7 (gates) | S | Low | 1 |

Want me to start with **Phase 0 (T0.1–T0.3)** and write the ESLint/Prettier config plus the package.json scripts? I can also save this plan as `docs/REFACTOR_PLAN.md` so it's tracked in the repo.
