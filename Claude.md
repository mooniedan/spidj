# CLAUDE.md

Persistent context for Claude Code working on the **DJ Graph View** desktop app. Read this every session before doing work in this repo.

---

## Project at a glance

This repo builds a **native desktop DJ application** that visualises suggested next tracks as a graph radiating from the current track. Drag suggestions to a deck (immediate use) or to an "Up Next" queue (planning); recursively re-anchor the graph on queue items to plan multi-track sets. Real audio plays out through the system audio device, driven by a real MIDI controller (Numark Mixtrack Platinum).

**Final deliverable:** a Tauri desktop app (Rust backend + React/TypeScript frontend) running on Windows, distributable as a single installer.

**Status:** requirements complete, M1 (vertical hardware-to-audio slice) in progress. See `.claude/plans/let-s-focmulate-an-implementation-dazzling-porcupine.md` for the implementation plan.

---

## Source of truth

| Document | Role | When to update |
|---|---|---|
| `.claude/requirements.md` | **Canonical UI/UX spec.** Every requirement has a stable ID (`REQ-DECK-07`, `REQ-GRAPH-11`, etc.). | Only when scope genuinely changes. Edits require a brief rationale in the commit message. |
| `.claude/poc.md` | Historical record of the controller-feasibility spike that defined the Tauri/Rust/MIDI stack. | Frozen — do not edit. |
| `.claude/plans/*.md` | The phased implementation plan. Created by Claude Code in plan mode and approved before code is written. | Once per milestone: refine upcoming milestone scopes if learning has shifted them. |
| `phases/PHASE-N.md` | Per-phase document: scope, REQ-IDs covered, acceptance checks, file changes. | Created at the start of each phase. Updated only with a "completed" note when the phase ships. |
| `CLAUDE.md` | This file. Operating rules. | When workflow conventions change, not when requirements change. |

**REQ-IDs are stable.** Reference them everywhere — commit messages, phase docs, code comments where useful, PR descriptions. Don't paraphrase requirements; quote the ID.

If a requirement seems wrong or under-specified, **do not silently reinterpret it**. Surface the ambiguity in the phase doc's "Open questions" section, propose a resolution, and continue. The user reviews phase docs before implementation.

---

## Workflow

### Before any code

1. Read `.claude/requirements.md` end to end if you haven't this session.
2. Check the latest plan in `.claude/plans/`. If a plan does not exist for the work in question, create one in plan mode and get approval.
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

The suggestion engine algorithm (`requirements.md` §6.3) is a pure function from `(anchor, library, config)` to `Suggestion[]`. **Build it as a pure function with Vitest tests before any graph UI.** It is cheap, testable, and unblocks every UI experiment downstream. A reusable port already exists in `prototypes/data.jsx` and can be lifted to `src/engine/`.

### Demo states last

`REQ-DEMO-*` is a comprehensive integration test in disguise. Save it for the final phase. If you build it earlier, you'll spend time wiring states for features that don't exist yet.

### Audio + controller belong in Rust

State of truth for transport (playing/position/cue/speed) lives in Rust. The frontend is a thin view: it issues `invoke()` calls and listens for state-change events. **MIDI input is mapped to deck actions in Rust**, not in the frontend, to keep latency tight (target end-to-end button-press → audio change < 20 ms).

---

## Tech stack

### Frontend (`src/`)

- **Language:** TypeScript, strict mode.
- **Framework:** React 18+, functional components and hooks.
- **Build tooling:** Vite (Tauri's default).
- **Styling:** Tailwind. Use core utility classes plus arbitrary-value syntax for the gunmetal/red palette (e.g., `bg-[#1a1d22]`, `text-[#c8302e]`).
- **Icons:** `lucide-react`.
- **Drag-and-drop:** Native HTML5 drag-and-drop. Don't add `react-dnd`, `dnd-kit`, etc. without proposing it in a phase doc and getting approval.
- **State:** `useState` + `useReducer` lifted to the root, or a single Zustand store. Pick one in M1 and stick with it. **No Redux.**
- **Testing:** Vitest for the engine pure function. UI verification is manual against the phase checklist.

### Backend (`src-tauri/`)

- **Language:** Rust (edition 2021).
- **Framework:** Tauri 2.x.
- **MIDI input:** `midir`.
- **Audio output:** `cpal` (WASAPI on Windows).
- **Audio decoding:** `symphonia` (mp3, wav, flac, aac, isomp4 features).
- **File walking:** `walkdir`.
- **Locking:** `parking_lot` (lighter than `std::sync` and acceptable inside the audio callback).

### Persistence

- Configuration (MIDI mappings, last-opened folder, settings) lives on disk as JSON via Tauri's `fs` plugin or app-data dir helpers.
- Browser storage APIs (`localStorage`, `sessionStorage`, `IndexedDB`) are still **forbidden** — desktop apps have proper file persistence; don't reach for browser sandboxes.
- `<form>` elements are forbidden — use `onClick`/`onChange` directly.
- `dangerouslySetInnerHTML` is forbidden.

---

## File organisation

The repo is a **Cargo + npm workspace** (since SP-0). The live-DJ app and the
forthcoming Serato Set Planner are both apps under `apps/`; shared Rust code
lives under `crates/`.

```
spidj/
├── Cargo.toml                        # workspace root (Rust)
├── package.json                      # workspace root (npm)
├── Cargo.lock                        # workspace lockfile
├── package-lock.json                 # workspace lockfile
├── CLAUDE.md
├── .claude/
│   ├── requirements.md
│   ├── poc.md
│   └── plans/*.md
├── phases/PHASE-N.md
├── prototypes/                       # historical UI explorations; reference only
├── apps/
│   └── spidj/                        # the live-DJ app (M1+M2+M3)
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── tailwind.config.js
│       ├── index.html
│       ├── src/                      # React frontend
│       │   ├── main.tsx, App.tsx, types.ts
│       │   ├── ipc/tauri.ts
│       │   ├── engine/               # M3: pure suggestion engine + tests
│       │   ├── components/
│       │   └── theme.ts
│       └── src-tauri/                # Rust backend (cpal + symphonia + midir)
│           ├── Cargo.toml
│           └── src/{main,lib,midi,audio,library,deck,commands}.rs
└── crates/                           # shared Rust crates (created in SP-1+)
    ├── spidj-engine/                 # SP-1: Rust port of M3 suggestion engine
    └── serato-io/                    # SP-2: Serato library reader + .crate writer
```

Folder names match the conceptual areas of `requirements.md §5`. Component names follow PascalCase; files named for the component they export.

When working on the live-DJ app, `cd apps/spidj` and run the usual `npm run tauri dev`. From the workspace root, `npm run dev` and `npm run tauri` proxy to the spidj workspace.

---

## Code conventions

### TypeScript

- **Types live in `src/types.ts`.** Don't redefine `Track`, `Deck`, `QueueItem` etc. anywhere else. If a new type emerges, add it there.
- **No `any`.** If a type is genuinely unknown, use `unknown` and narrow.
- **Discriminated unions** for `AnchorSource` and similar — do not flatten them into a single object with optional fields.
- **Inline styles** are acceptable for one-off colour values from the gunmetal/red palette where Tailwind arbitrary-value syntax is awkward (gradients, shadows). Otherwise use Tailwind.
- **No prop drilling beyond two levels.** Lift to context or store.

### Rust

- **`#![deny(warnings)]` is too strict for a prototype**, but `cargo clippy` should run clean before declaring a phase done.
- Audio callback is real-time-sensitive: **no allocation, no `std::sync::Mutex`, no logging** inside it. Use `parking_lot::Mutex` (small critical sections only) or lock-free structures.
- Tauri commands return `Result<T, String>`; map internal errors to short messages the frontend can display.
- Types crossing the IPC boundary derive `Serialize` + `Deserialize` and live in the module that owns them; mirror them in `src/types.ts`.

### Comments

- **Comments explain *why*, not *what*.** A comment that paraphrases the line below it is noise.
- A comment referencing a REQ-ID for non-obvious behaviour is signal.

---

## Visual style cheat-sheet

Full spec in `requirements.md §5.10`. At a glance:

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
- Keep MIDI-to-transport mapping in Rust, not in the frontend.
- Run the acceptance checklist before declaring a phase done.
- Default to the simpler implementation when two are roughly equivalent.

### Never

- Don't build the Browse, Crates, or History tabs. They render as visibly disabled tabs and that is the entire scope.
- Don't auto-filter the library based on graph state (`requirements.md §5.8` acceptance: "library and graph remain conceptually independent"). Library and graph crosstalk through exactly one gesture: drag a library track to the graph.
- Don't add a "refresh" button. Pagination is via Prev/Next arrows (`requirements.md §5.7`). Refresh was explicitly replaced.
- Don't surface track history inside the queue strip. The queue is strictly forward-looking (REQ-QUEUE-13).
- Don't introduce animation beyond the spinning platter and the 150ms transitions. The graph view is information-dense and motion is distracting in the live-DJ context.
- Don't use `<form>`, `localStorage`, `sessionStorage`, `IndexedDB`, or `dangerouslySetInnerHTML`. Use Tauri `fs` for persistence.
- Don't allocate or take heavy locks inside the cpal audio callback.

---

## Verification

A phase is **done** when:

1. Every REQ-ID in scope has its acceptance criteria visibly satisfied in a manual run-through.
2. The phase's checklist in `phases/PHASE-N.md` is fully ticked.
3. The app runs locally with no console errors, no Cargo errors, and no TypeScript errors.
4. `cargo clippy` reports no warnings of severity error. Warnings are acceptable when documented.

A phase is **not** done because the code "looks right" or "should work." Run it. Plug in the controller. Drag things. Click things. Walk the recursive-anchor flow at least once.

---

## Asking vs deciding

If genuinely ambiguous: log in the phase doc's "Open questions" section, propose a default resolution, mark with `OPEN:`, and continue. Do not block waiting for clarification on minor points.

If the ambiguity touches a `MUST` requirement or an architectural decision (state management, file structure, library choice, audio architecture): stop and ask before proceeding.

If a requirement appears to contradict another: stop and ask. Do not silently pick one.
