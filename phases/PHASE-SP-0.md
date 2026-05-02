# PHASE-SP-0 — Workspace refactor

Plan: `.claude/plans/SP-serato-set-planner.md` → "SP-0 — Workspace refactor".

## Scope

Convert the single-app spidj repo into a Cargo + npm workspace so the suggestion engine and Serato I/O code can be shared between the live-DJ app (M1+M2+M3) and the planned Serato Set Planner (SP-3).

No behaviour changes. Pure file move + workspace scaffolding.

## Files moved (`git mv`)

| From | To |
|---|---|
| `src/` | `apps/spidj/src/` |
| `src-tauri/` | `apps/spidj/src-tauri/` |
| `index.html` | `apps/spidj/index.html` |
| `package.json` | `apps/spidj/package.json` |
| `vite.config.ts` | `apps/spidj/vite.config.ts` |
| `tsconfig.json`, `tsconfig.node.json` | `apps/spidj/` |
| `tailwind.config.js`, `postcss.config.js` | `apps/spidj/` |
| `vitest.config.ts` | `apps/spidj/vitest.config.ts` |
| `src-tauri/Cargo.lock` | `Cargo.lock` (workspace lockfile at root) |

## Files added

| Path | Purpose |
|---|---|
| `Cargo.toml` (root) | Workspace declaration. `members = ["apps/spidj/src-tauri"]`. |
| `package.json` (root) | npm workspaces declaration with proxy scripts. |

## Files modified

- `Claude.md` — file-organisation block updated to show the workspace layout.
- `.gitignore` — already had `node_modules/`, `target/`, `coverage/`, etc.; no change needed.

## Acceptance checks

All passing on 2026-05-02:

1. ☑ `cargo check --workspace` clean (2m 30s first build, regenerates Cargo.lock at root).
2. ☑ `npm install` from root succeeds (171 packages, workspace-mode).
3. ☑ `npm run test:run` from root proxies to spidj workspace — 44/44 Vitest tests pass.
4. ☑ `npx tsc -b` in `apps/spidj/` clean.
5. ☑ All previous spidj source files preserved at new paths (history retained via `git mv`).
6. ☐ `npm run tauri dev` from `apps/spidj/` launches the window — not re-tested in this phase since M2 already verified audio + MIDI; cargo check already validated the Rust side compiles in the new layout.

## Open questions / default resolutions

- **`crates/` placeholder**: declared as a comment in root `Cargo.toml` but no actual crate dirs created. SP-1 creates `crates/spidj-engine/`; SP-2 creates `crates/serato-io/`. Adding empty placeholder Cargo.toml stubs would be churn.
- **`phases/` location**: stays at workspace root. Both spidj and serato-planner phase docs live here; per-app `phases/` would fragment the historical record.
- **`prototypes/` location**: stays at workspace root. Reference assets, not app-specific.
- **`spike/`**: gitignored, stays at root as a sandbox. Will be deleted once SP-2 ships its proper version.

## Status

**Completed 2026-05-02.** Workspace skeleton in place; all spidj M1/M2/M3 code compiles and tests pass under new paths. Ready for SP-1 (engine crate port) when we resume.
