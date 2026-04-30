# CLAUDE.md

Persistent context for Claude Code working on the **DJ Graph View** prototype. Read this every session before doing work in this repo.

---

## Project at a glance

This repo builds a prototype of a novel DJ-software view that visualises suggested next tracks as a graph radiating from the current track. Drag suggestions to a deck (immediate use) or to an "Up Next" queue (planning); recursively re-anchor the graph on queue items to plan multi-track sets.

**Final deliverable:** a single React artifact runnable in Claude.ai's artifact pane. Development happens in a normal multi-file project; a final step collapses to single-file.

**Status:** requirements complete, implementation phased.

---

## Source of truth

| Document | Role | When to update |
|---|---|---|
| `REQUIREMENTS.md` | **Canonical spec.** Every requirement has a stable ID (`REQ-DECK-07`, `REQ-GRAPH-11`, etc.). | Only when scope genuinely changes. Edits require a brief rationale in the commit message. |
| `PLAN.md` | The phased implementation plan. Claude Code produces this before any code. | Once per phase: tick off completed phases, refine upcoming phase scopes if learning has shifted them. |
| `phases/PHASE-N.md` | Per-phase document: scope, REQ-IDs covered, acceptance checks, file changes. | Created at the start of each phase. Updated only with a "completed" note when the phase ships. |
| `CLAUDE.md` | This file. Operating rules. | When workflow conventions change, not when requirements change. |

**REQ-IDs are stable.** Reference them everywhere — commit messages, phase docs, code comments where useful, PR descriptions. Don't paraphrase requirements; quote the ID.

If a requirement seems wrong or under-specified, **do not silently reinterpret it**. Surface the ambiguity in the phase doc's "Open questions" section, propose a resolution, and continue. The user reviews phase docs before implementation.

---

## Workflow

### Before any code

1. Read `REQUIREMENTS.md` end to end if you haven't this session.
2. Check `PLAN.md`. If it doesn't exist, create it. The plan should:
   - Group REQ-IDs into phases that respect Section 9 ("Dependency Notes") of the requirements.
   - Each phase should be shippable in isolation — i.e., the prototype renders meaningfully and demonstrates *something* after each phase.
   - Aim for 6–10 phases. Fewer is fine; more usually means phases are too small.
   - Identify the first phase's scope precisely.
3. Wait for user review of the plan before writing code.

### For each phase

1. Create `phases/PHASE-N.md` with:
   - **Scope:** the REQ-IDs delivered.
   - **Out of scope (deferred):** REQ-IDs explicitly *not* delivered, even if tempting.
   - **Files touched:** new and modified, with a one-line note per file.
   - **Acceptance checks:** a checklist derived from the "Acceptance" rows of the included REQ-IDs.
   - **Open questions:** any ambiguities; default-resolve and note the assumption.
2. Wait for user review of the phase doc before writing code.
3. Implement.
4. Walk the acceptance checklist. Mark each item ✓ or ✗ in the phase doc.
5. Hand off to the user for review. Do not begin the next phase until told.

### Pure functions before UI

The suggestion engine algorithm (Requirements §6.3) is a pure function from `(anchor, library, config)` to `Suggestion[]`. **Build it first**, before any graph UI. It is cheap, testable, and unblocks every UI experiment downstream. Co-locate unit tests with it.

### Demo states last

`REQ-DEMO-*` is a comprehensive integration test in disguise. Save it for the final phase. If you build it earlier, you'll spend time wiring states for features that don't exist yet.

---

## Tech stack

- **Language:** TypeScript, strict mode.
- **Framework:** React 18+, functional components and hooks.
- **Build tooling:** Vite. (Final artifact step bundles to a single file.)
- **Styling:** Tailwind. Use core utility classes plus arbitrary-value syntax for the gunmetal/red palette (e.g., `bg-[#1a1d22]`, `text-[#c8302e]`). Do **not** add custom Tailwind plugins or extend the config — the final artifact runs without a Tailwind compiler.
- **Icons:** `lucide-react`.
- **Drag-and-drop:** Native HTML5 drag-and-drop. Do **not** add `react-dnd`, `dnd-kit`, or similar without proposing it in a phase doc and getting approval — they are convenient but the prototype's drag matrix (Requirements §7.1) is small enough that native suffices.
- **State:** `useState` + `useReducer` lifted to the root, or a single Zustand store. Pick one in Phase 1 and stick with it. **No Redux.**
- **Testing:** Vitest for the engine pure function. UI does not need automated tests for this prototype; manual acceptance against the phase checklist is the verification.
- **Forbidden in app code:** `localStorage`, `sessionStorage`, `IndexedDB`, `fetch` to any URL, `<form>` elements (use `onClick`/`onChange` directly), `dangerouslySetInnerHTML`.

---

## File organisation

```
/
├── CLAUDE.md
├── REQUIREMENTS.md
├── PLAN.md
├── phases/
│   └── PHASE-N.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types.ts                  # All interfaces from Requirements §6.1
│   ├── mockData.ts               # The ~40 mock tracks (Requirements §6.2)
│   ├── engine/
│   │   ├── suggestionEngine.ts   # Pure scoring function (Requirements §6.3)
│   │   ├── suggestionEngine.test.ts
│   │   └── camelot.ts            # Camelot-wheel adjacency helpers
│   ├── components/
│   │   ├── DeckRow/
│   │   ├── MiddleBand/
│   │   │   ├── TabStrip.tsx
│   │   │   ├── GraphCanvas.tsx
│   │   │   ├── QueueStrip.tsx
│   │   │   └── SettingsModal.tsx
│   │   ├── Library/
│   │   └── DemoStateToggle.tsx
│   ├── state/                    # Whichever state approach was chosen
│   └── theme.ts                  # Palette + typography constants
└── package.json
```

Folder names match the conceptual areas of `REQUIREMENTS.md §5`. Component names follow PascalCase; files named for the component they export.

---

## Code conventions

- **Types live in `src/types.ts`.** Don't redefine `Track`, `Deck`, `QueueItem` etc. anywhere else. If a new type emerges, add it there.
- **No `any`.** If a type is genuinely unknown, use `unknown` and narrow.
- **Discriminated unions** for `AnchorSource` and similar — do not flatten them into a single object with optional fields.
- **Inline styles** are acceptable for one-off colour values from the gunmetal/red palette where Tailwind arbitrary-value syntax is awkward (gradients, shadows). Otherwise use Tailwind.
- **No prop drilling beyond two levels.** Lift to context or store.
- **Comments explain *why*, not *what*.** A comment that paraphrases the line below it is noise. A comment referencing a REQ-ID for non-obvious behaviour is signal.

---

## Visual style cheat-sheet

Full spec in `REQUIREMENTS.md §5.10`. At a glance:

- Background: `#0a0a0a` (near-black).
- Surfaces: `#1a1d22`, `#22262c` (gunmetal grays).
- Accent — metallic red: gradient `#c8302e → #a02220`. **Reserved for: live deck glow, anchor node glow, anchor-source border, page indicator active state, primary buttons.**
- Text: white for primary, white at 60–70% opacity for secondary.
- **No amber, green, or blue.** Warning states use a desaturated red plus iconography and copy.
- Sans for UI text (Inter or system stack), mono for numerics (BPM, key, pitch %, page indicator).
- Borders are reserved for the metallic-red anchor-source treatment. Use shadows for elevation.
- Motion: only the spinning live-deck platter, plus 150ms hover/drag/expand transitions. **No pulsing nodes, no animated edges, no looping animations.**

---

## Always / Never

### Always

- Reference REQ-IDs in commits and phase docs.
- Build the suggestion engine as a pure, deterministic function with unit tests **before** any graph UI.
- Treat the final artifact constraint (single-file, no `localStorage`, etc.) as a permanent constraint during development. Don't introduce a dependency that will need to be ripped out at the artifact-collapse step.
- Run the acceptance checklist before declaring a phase done.
- Default to the simpler implementation when two are roughly equivalent.

### Never

- Don't add real audio, real metadata extraction, real BPM detection, or real persistence. Mock everything. (Requirements §2.)
- Don't build the Browse, Crates, or History tabs. They render as visibly disabled tabs and that is the entire scope.
- Don't auto-filter the library based on graph state (Requirements §5.8 acceptance: "library and graph remain conceptually independent"). Library and graph crosstalk through exactly one gesture: drag a library track to the graph.
- Don't add a "refresh" button. Pagination is via Prev/Next arrows (Requirements §5.7). Refresh was explicitly replaced.
- Don't surface track history inside the queue strip. The queue is strictly forward-looking (REQ-QUEUE-13).
- Don't introduce animation beyond the spinning platter and the 150ms transitions. The graph view is information-dense and motion is distracting in the live-DJ context.
- Don't use `<form>`, `localStorage`, fetched assets, or any storage API. (TECH-02, TECH-03, TECH-05.)

---

## Verification

A phase is **done** when:

1. Every REQ-ID in scope has its acceptance criteria visibly satisfied in a manual run-through.
2. The phase's checklist in `phases/PHASE-N.md` is fully ticked.
3. The prototype runs locally with no console errors and no TypeScript errors.
4. No linter warnings of severity `error`. Warnings are acceptable when documented.

A phase is **not** done because the code "looks right" or "should work." Run it. Drag things. Click things. Walk the recursive-anchor flow at least once.

---

## Asking vs deciding

If genuinely ambiguous: log in the phase doc's "Open questions" section, propose a default resolution, mark with `OPEN:`, and continue. Do not block waiting for clarification on minor points.

If the ambiguity touches a `MUST` requirement or an architectural decision (state management, file structure, library choice): stop and ask before proceeding.

If a requirement appears to contradict another: stop and ask. Do not silently pick one.

---

## Final-artifact collapse

At the end of the last phase, a separate artifact-export step bundles the multi-file source into a single React component file suitable for pasting into Claude.ai's artifact pane. This is its own phase. Plan accordingly: keep imports tidy, avoid deep relative paths that fight bundling, and don't rely on Vite-specific features (env vars, dynamic imports) in app code.