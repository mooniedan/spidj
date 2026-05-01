# DJ Graph View — Requirements Document

**Document purpose.** This document specifies the requirements for an interactive prototype of a novel "graph view" for DJ software. It is intended to be consumed by Claude Code to produce a phased implementation plan and the implementation itself. Requirements are individually IDed so phase documents can reference them precisely (e.g., "Phase 2 delivers REQ-GRAPH-01 through REQ-GRAPH-09").

**Status.** Draft. Decisions captured during a structured design session. Open questions, if any, are flagged inline with `OPEN:`.

---

## 1. Overview

### 1.1 What is being built

An interactive React-based prototype of a DJ software view called the **Graph View**. The Graph View is a recommendation and set-planning tool that visualises suggested next tracks as nodes radiating from the currently anchored track. The DJ can:

- Drag suggestion nodes directly to a virtual deck (immediate use), or
- Drag suggestions to an "Up Next" queue (planning), or
- Recursively anchor the graph to a queued track to plan multiple tracks ahead.

The graph view sits in the middle of a three-band layout: virtual decks above, the graph view (one of several tabbed sub-views) in the middle, and a conventional library/search at the bottom.

### 1.2 What is novel about this design

Most DJ software treats "queue" as a flat list and "suggestions" as a separate browser. This design fuses them: the queue is built **from** the graph, and **any queue item can become the next anchor**, enabling recursive walks through the suggestion space. The DJ effectively performs a guided graph traversal across their library while building a set list, with each step constrained by configurable musical-compatibility criteria.

### 1.3 Success criteria

The prototype is a success if a DJ can, against mock data:

1. See suggestions for the currently playing track without leaving the main view.
2. Drag a suggested track to either deck or to the queue.
3. Plan three tracks ahead by recursively anchoring on queue items, without ever opening a search box.
4. Adjust the suggestion criteria once at the start of a session and trust the engine for the rest of it.
5. Confidently switch between graph mode and "plan mode" (graph collapsed, working with queue + library only).

### 1.4 Output format

> **Updated 2026-05-01:** the original spec targeted a single React artifact for Claude.ai with mock-only decks. The project has pivoted to a **native Tauri desktop app** (Rust backend + React/TS frontend) with **real audio output** driven by a real MIDI controller (Numark Mixtrack Platinum). The clauses below have been amended to reflect this. See `.claude/poc.md` for the controller-feasibility spike that informed the stack and `.claude/plans/` for the implementation plan.

A Tauri desktop application running on Windows. The frontend is the Graph View UI; the backend produces real audio through the system audio device and accepts MIDI input from a connected DJ controller. Drag, drop, click, hover, configuration changes, **and transport controls** are functional. Mock data is still acceptable for fields that have no source yet (BPM, key, energy) until analysis is wired up.

---

## 2. Non-Goals

Explicit non-goals so Claude Code does not over-build:

- ~~**No audio playback.** Decks are visual emulations only.~~ **Retired 2026-05-01.** Real audio playback via `cpal`/`symphonia` is now a goal.
- **No real BPM, key, or metadata detection.** Mock or hash-stable random values are acceptable for prototype phases. Real analysis (e.g. via `aubio`) is post-MVP.
- ~~**No real transport controls.** Play/pause/cue/sync buttons render but do not function.~~ **Retired 2026-05-01.** Play/pause/cue are functional and wired to the controller. Sync is post-MVP.
- **No EQ/effects logic.** EQ knobs render but do not filter audio. (Real EQ is post-MVP.)
- **No working "Browse," "Crates," or "History" tabs.** These appear in the tab strip but are visibly disabled.
- **No real library search backend.** A simple in-memory filter against the scanned folder is sufficient; no fuzzy search, no full-text indexing.
- **No browser-storage persistence.** No `localStorage`, no `sessionStorage`, no `IndexedDB`. Configuration persists via Tauri `fs` to disk JSON.
- **No multi-user or remote features.**
- **No mobile or touch optimisation.** Desktop pointer-driven interaction only.
- **No accessibility audit / WCAG compliance** beyond basic semantic HTML and keyboard focus on interactive elements.

---

## 3. Personas & Primary Workflows

### 3.1 Persona: "Mid-set DJ"

A DJ performing a 60–120-minute set. Cognitive load is high; lighting may be poor; precise drag is harder than in office conditions. They have ~30 seconds between deciding what's next and needing the track loaded and beat-matched. They reason about set arc in terms of energy, key compatibility, and BPM trajectory.

### 3.2 Persona: "Pre-set DJ planning"

The same DJ, an hour before the set, on a laptop in a green room or hotel. They are stress-testing track sequences. Cognitive load is lower; they can experiment with the recursive graph-walk model freely. The "plan mode" workflow (graph collapsed, queue-driven planning) is primarily for this persona.

### 3.3 Primary workflow A — Live next-track selection

1. Track is playing on Deck A. Deck B is empty or holds a previous track.
2. DJ clicks Deck A. Graph expands; 7 suggestion nodes appear around the track on Deck A as the anchor.
3. DJ scans suggestions; reads reason chips ("Same artist", "Shared key 8A", "+2 BPM"); identifies a candidate.
4. DJ drags the candidate's node to Deck B (or hovers and clicks "Load to B"). The candidate becomes the cued track.
5. DJ mixes from A to B in the real DJ software (out of scope for this prototype).

### 3.4 Primary workflow B — Multi-track planning ("plan mode")

1. Both decks may or may not be loaded. Graph is collapsed. Queue is empty.
2. DJ drags a track from the library into the graph drop zone. Graph expands; this track becomes the anchor.
3. DJ drags two suggestions to the queue.
4. DJ clicks the second queue item. Graph re-anchors to it. Pagination resets.
5. DJ drags two more suggestions to the queue.
6. Repeat until the planned set length is reached.
7. During the live set, DJ uses workflow A or simply loads from the top of the queue.

### 3.5 Primary workflow C — One-time configuration

1. DJ opens the suggestions settings modal (gear icon in the graph header).
2. DJ disables criteria they do not care about (e.g., turns off "Year").
3. DJ adjusts BPM tolerance (e.g., 3% slow / 8% fast for an open-format set).
4. DJ sets strictness slider.
5. DJ closes the modal. Settings persist for the session.

---

## 4. Glossary

Terms used throughout this document. Claude Code may not be deeply familiar with DJ-specific vocabulary; these definitions are normative.

| Term | Definition |
|---|---|
| **Anchor** | The track the graph radiates suggestions from. The current anchor is shown as a larger central node. There is exactly one anchor at a time, or none if the graph is in cold-start state. |
| **Anchor source** | The UI element (a deck, a queue card, or a library row) that supplied the current anchor. The anchor source is visually distinguished by a metallic red border. |
| **Camelot notation** | A standard musical-key notation used by DJs, expressed as a number 1–12 followed by `A` (minor) or `B` (major). Adjacent numbers and the `A`/`B` partner are harmonically compatible. Example: `8A`, `9A`, `8B`. |
| **BPM** | Beats per minute. Tempo. Tracks within a few BPM of each other can be mixed without obvious tempo distortion. |
| **BPM tolerance** | The DJ's acceptable range of BPM deviation when pitching a track up or down. Asymmetric: most DJs accept more upward pitch than downward. |
| **Strictness** | A global slider controlling how tightly the suggestion engine adheres to active criteria. Loose = more divergent suggestions; Strict = closer matches only. |
| **Live deck** | The deck currently playing the track audible to the audience. Distinguished by a spinning platter and a metallic red glow. |
| **Cued deck** | A deck with a track loaded but not currently audible (typically headphones-only in real software). No spinning platter, no glow. |
| **Up Next queue** | A user-curated forward-looking list of planned tracks. Persistent across anchor changes. Tracks disappear from the queue when loaded to a deck. |
| **Recursive anchoring** | Setting the graph's anchor to a track that came from a previous suggestion or queue item, enabling traversal of the suggestion space. |
| **Suggestion reason** | A short string describing why a particular track was suggested for the current anchor (e.g., "Tag: melodic techno"). Each suggestion node displays its primary reason as a chip. |

---

## 5. Functional Requirements

Each requirement carries an ID, a priority (`MUST` / `SHOULD` / `MAY`), and acceptance criteria. Requirements are grouped by feature area.

### 5.1 Layout (REQ-LAYOUT)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-LAYOUT-01** | MUST | Application uses a three-band vertical layout: deck row (top), middle band (centre), library (bottom). Bands fill the full window width. |
| **REQ-LAYOUT-02** | MUST | Top deck row is fixed in height (~25–30% of window height when graph is expanded; same when collapsed — only the middle and bottom bands rebalance). |
| **REQ-LAYOUT-03** | MUST | A drag handle exists between the middle band and the bottom band, allowing the user to manually resize the boundary. |
| **REQ-LAYOUT-04** | MUST | When the graph is collapsed (see REQ-GRAPH-01), the bottom band grows upward to fill the freed vertical space. When the graph is expanded, the bottom band shrinks back to ~25% of window height. |
| **REQ-LAYOUT-05** | MUST | The middle band contains a tab strip at its top with four tabs in this order: "Graph" (active), "Browse," "Crates," "History." |
| **REQ-LAYOUT-06** | MUST | Only the "Graph" tab is functional. The other three are rendered as visibly disabled (reduced opacity, no hover state, no click action). |

**Acceptance:** Window resize never breaks the three-band proportions; the drag handle works at minimum and maximum boundaries with sensible limits (graph cannot collapse below the "Show suggestions" bar height, library cannot collapse below ~3 rows).

### 5.2 Deck Row (REQ-DECK)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-DECK-01** | MUST | Two virtual decks render side by side, labelled Deck A (left) and Deck B (right). |
| **REQ-DECK-02** | MUST | Each deck emulates a CDJ-style physical layout: circular spinning platter with album art at centre, transport controls (play/pause, cue, sync), pitch fader, three EQ knobs (high/mid/low), tempo display showing BPM and pitch %, a horizontal waveform strip across the top. |
| **REQ-DECK-03** | MUST | Transport controls (play/pause, cue) drive real audio playback through `cpal`/`symphonia` and reflect real deck state. Sync, EQ, and effects remain visual-only for now. *Amended 2026-05-01.* |
| **REQ-DECK-04** | MUST | The live deck has a continuously spinning platter; the cued deck's platter is still. |
| **REQ-DECK-05** | MUST | The live deck has a subtle metallic-red glow/bloom around the platter rim and displays a small "LIVE" pill. |
| **REQ-DECK-06** | MUST | A deck whose track is currently the graph's anchor source displays a metallic-red border treatment around the deck chrome. |
| **REQ-DECK-07** | MUST | Clicking on a loaded deck sets that deck's track as the graph's anchor (see REQ-GRAPH-10) and expands the graph if collapsed (see REQ-GRAPH-12). |
| **REQ-DECK-08** | MUST | Each deck acts as a drop target for tracks from the library and from the graph. Dropping a track loads it onto that deck (replacing any existing track). |
| **REQ-DECK-09** | MUST | An empty deck displays a placeholder ("Drop a track or load from queue") in place of album art and metadata. |
| **REQ-DECK-10** | SHOULD | Clicking an empty deck does nothing (no anchor change, no graph expansion). |

**Acceptance:** Drag-and-drop from any source produces a visible deck state change; live-deck glow is visible but not distracting; clicking the live deck and the cued deck both correctly anchor the graph.

### 5.3 Graph View — Canvas (REQ-GRAPH)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-GRAPH-01** | MUST | The graph canvas has exactly two states: **collapsed** and **expanded**. There is no intermediate "compact" state. |
| **REQ-GRAPH-02** | MUST | In the collapsed state, the graph canvas renders as a thin row (~40–48px) containing a labelled button reading "Show suggestions." |
| **REQ-GRAPH-03** | MUST | The "Show suggestions" button acts as a drop target. Dropping a library track on it expands the graph and sets that track as the anchor. |
| **REQ-GRAPH-04** | MUST | In the expanded state, the graph canvas renders an anchor node centred horizontally, surrounded radially by N suggestion nodes (default N=7). N is configurable in settings (REQ-SUGGEST-05). |
| **REQ-GRAPH-05** | MUST | The anchor node is visually larger than suggestion nodes and carries a metallic-red glow matching the live-deck treatment. |
| **REQ-GRAPH-06** | MUST | Each suggestion node renders: album art thumbnail, track title, artist (lower opacity), BPM (monospaced), key in Camelot notation (monospaced), and a primary reason chip (see REQ-SUGGEST-06). |
| **REQ-GRAPH-07** | MUST | If a suggestion has multiple matching reasons, the strongest reason is shown as the primary chip with a "+N more" affordance that reveals the remaining reasons on hover. |
| **REQ-GRAPH-08** | MUST | Suggestion nodes are connected to the anchor node by thin gunmetal-coloured edges. Edges are static (no animation). |
| **REQ-GRAPH-09** | MUST | Suggestion nodes are draggable. Drop targets: Deck A, Deck B, the queue strip. |
| **REQ-GRAPH-10** | MUST | The graph has exactly one anchor at any time. The anchor is set by the most recent of: clicking a loaded deck (REQ-DECK-07), clicking a queue item (REQ-QUEUE-05), dragging a library track to the graph drop zone (REQ-GRAPH-03 / REQ-LIB-04), or hover-clicking the recursive-anchor icon on a suggestion node (REQ-GRAPH-11). |
| **REQ-GRAPH-11** | MUST | Hovering a suggestion node reveals a small graph icon affordance. Clicking that icon sets the suggestion's track as the new anchor (recursive anchoring) without committing the track to a deck or queue. |
| **REQ-GRAPH-12** | MUST | Any anchor change auto-expands the graph if it was collapsed. |
| **REQ-GRAPH-13** | MUST | When the graph is collapsed manually (via the drag handle in REQ-LAYOUT-03), no anchor change occurs; the existing anchor is retained. |
| **REQ-GRAPH-14** | MUST | The graph view contains a queue strip on its right side (~220px wide) that is **always visible**, regardless of whether the graph canvas is collapsed or expanded (see REQ-QUEUE). |
| **REQ-GRAPH-15** | MUST | The cold-start state (no decks loaded, no queue items, no anchor) renders the graph collapsed with secondary copy in the "Show suggestions" bar: "Load a track or drag from your library to begin." |

**Acceptance:** Every anchor source produces the same visual result (anchor node centred, suggestions around it). The recursive-anchor gesture works for any number of consecutive walks. Collapse/expand transitions are visually smooth (~150ms ease).

### 5.4 Graph View — Header (REQ-HEADER)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-HEADER-01** | MUST | When expanded, the graph canvas displays a header row above the node area. |
| **REQ-HEADER-02** | MUST | The header shows a filter status chip on the left summarising the active engine config, e.g.: `Range 119–131 BPM · Key Am · 6 of 7 criteria · Strict`. The chip is read-only display; it does not open the settings modal. |
| **REQ-HEADER-03** | MUST | The header shows pagination controls on the right: a Prev arrow button, a page indicator (`Page X of Y`), and a Next arrow button (see REQ-PAGE). |
| **REQ-HEADER-04** | MUST | The header shows a gear icon (rightmost) that opens the suggestions settings modal (see REQ-SUGGEST-07). |

### 5.5 Up Next Queue (REQ-QUEUE)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-QUEUE-01** | MUST | A vertical queue strip (~220px wide) is rendered on the right side of the middle band. It is always visible (collapsed graph, expanded graph, any tab). |
| **REQ-QUEUE-02** | MUST | The queue strip has a header labelled "UP NEXT" and a vertical list of queue cards below it. |
| **REQ-QUEUE-03** | MUST | Each queue card displays album art, track title, artist, BPM, and key. |
| **REQ-QUEUE-04** | MUST | Queue cards are reorderable via drag-and-drop within the queue. |
| **REQ-QUEUE-05** | MUST | Clicking a queue card sets its track as the graph's anchor and expands the graph if collapsed. |
| **REQ-QUEUE-06** | MUST | The queue card whose track is the current anchor source displays a metallic-red border treatment. |
| **REQ-QUEUE-07** | MUST | Hovering a queue card reveals two action buttons: "Load to A" and "Load to B" (and a remove ✕ button). |
| **REQ-QUEUE-08** | MUST | Clicking "Load to A" or "Load to B" loads the queued track to that deck and **removes the card from the queue immediately**. |
| **REQ-QUEUE-09** | MUST | Dragging a queue card to a deck has the same effect as clicking the corresponding Load button (track loads, card removed). |
| **REQ-QUEUE-10** | MUST | Clicking the remove (✕) button on a queue card removes it from the queue without loading it anywhere. |
| **REQ-QUEUE-11** | MUST | The queue strip acts as a drop target for tracks from the library and from the graph. Dropping adds a new queue card to the bottom of the list. |
| **REQ-QUEUE-12** | MUST | Empty queue state shows placeholder copy: "Drag suggestions or library tracks here to plan your set." |
| **REQ-QUEUE-13** | MUST | The queue is **strictly forward-looking**. No "history" or "played" section is shown in the queue strip. (History would live in the History tab, which is non-functional in this prototype.) |

**Acceptance:** The DJ can plan a 5-track set by dragging into the queue, click the third item to re-anchor the graph, drag two more suggestions, click the fifth item, and add additional suggestions — without the graph state or queue order ever becoming inconsistent.

### 5.6 Suggestion Engine & Settings (REQ-SUGGEST)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-SUGGEST-01** | MUST | The engine considers seven criteria when ranking suggestions: BPM, musical key, genre, tags, artist, year, energy level. |
| **REQ-SUGGEST-02** | MUST | Each criterion has an on/off toggle in the settings modal. All seven default to ON. |
| **REQ-SUGGEST-03** | MUST | The engine respects asymmetric BPM tolerance: separate "slow down up to N%" and "speed up up to N%" values. Defaults: slow 4%, speed 6%. |
| **REQ-SUGGEST-04** | MUST | A global "Strictness" slider (range Loose ↔ Strict) controls how tightly suggestions adhere to active criteria. Defaults to the middle. |
| **REQ-SUGGEST-05** | MUST | A numeric setting "Suggestions per page" controls how many suggestion nodes appear when the graph is expanded. Default 7. Range 5–12. |
| **REQ-SUGGEST-06** | MUST | Each suggestion carries one or more reason objects describing which criteria matched. The strongest reason is the primary reason (used for the chip in REQ-GRAPH-06). |
| **REQ-SUGGEST-07** | MUST | The suggestions settings modal opens via the gear icon (REQ-HEADER-04). It contains: seven criterion toggles, the strictness slider, two BPM tolerance steppers (slow / speed), and the suggestions-per-page numeric input. |
| **REQ-SUGGEST-08** | MUST | Settings changes apply immediately (or on modal close). Changes affect both already-rendered suggestions (re-paginated to page 1) and future anchors. |
| **REQ-SUGGEST-09** | MUST | The engine is mocked: it filters the in-memory mock library by the active criteria and returns ranked candidates. The filtering and ranking logic is deterministic for a given anchor + config. |
| **REQ-SUGGEST-10** | MUST | The filter status chip in the graph header (REQ-HEADER-02) reflects the current settings, including the resolved BPM range for the current anchor (e.g., `Range 119–131 BPM` when anchor is 124 BPM at default tolerances). |

**Acceptance:** Disabling a criterion produces visibly different suggestions; sliding strictness from Loose to Strict narrows results; changing BPM tolerance changes the resolved range chip; the page indicator updates correctly when suggestions-per-page changes.

### 5.7 Pagination (REQ-PAGE)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-PAGE-01** | MUST | Prev and Next arrow buttons in the graph header (REQ-HEADER-03) page through the suggestion candidate pool for the current anchor. |
| **REQ-PAGE-02** | MUST | Each Next click advances to the next page of N suggestions (N = suggestions-per-page), excluding tracks shown on previous pages for this anchor. |
| **REQ-PAGE-03** | MUST | Prev steps back to the previous page. Pages are cached in memory for the current anchor, so Prev returns the exact same suggestions the DJ saw before. |
| **REQ-PAGE-04** | MUST | A page indicator between the arrows shows `Page X of Y` where Y is the total number of pages the candidate pool supports. |
| **REQ-PAGE-05** | MUST | The Prev arrow is disabled when X=1. The Next arrow is disabled when X=Y. |
| **REQ-PAGE-06** | MUST | Anchor change (via any source in REQ-GRAPH-10) resets pagination to page 1 of the new anchor's candidate pool. The previous anchor's page cache is discarded. |
| **REQ-PAGE-07** | MUST | If the candidate pool is empty (zero results from current filters), the canvas shows the strict-filters empty state (see REQ-DEMO-04). Pagination chrome is hidden. |
| **REQ-PAGE-08** | SHOULD | If the candidate pool produces fewer than N results (e.g., 4 results when N=7), the page indicator shows `Page 1 of 1` and only the available nodes render; remaining radial slots are empty (no placeholder nodes). |

**Acceptance:** Clicking Next then Prev returns to the exact same page contents. Disabled states behave correctly at boundaries. Anchor change resets the indicator.

### 5.8 Library (REQ-LIB)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-LIB-01** | MUST | The bottom band renders a conventional library list view: a search input at the top, a row of filter pills, and a sortable column list of mock tracks. |
| **REQ-LIB-02** | MUST | Each library row displays: album art thumbnail, title, artist, BPM, key, genre, tags (truncated), year, energy. |
| **REQ-LIB-03** | MUST | Each library row is draggable. Drop targets: Deck A, Deck B, the queue strip, the graph drop zone (whether collapsed or expanded). |
| **REQ-LIB-04** | MUST | Dropping a library row on the graph area (collapsed "Show suggestions" bar OR the expanded canvas background) sets that track as the graph's anchor and expands the graph if collapsed. |
| **REQ-LIB-05** | MUST | Hovering a library row reveals "Load to A" and "Load to B" buttons that load the track directly to that deck. |
| **REQ-LIB-06** | SHOULD | The search input filters the visible rows by title or artist substring (case-insensitive). |
| **REQ-LIB-07** | MAY | Filter pills (e.g., "Genre," "BPM range," "Key") render as visual elements but do not necessarily filter for the prototype. |
| **REQ-LIB-08** | SHOULD | Library rows are sortable by clicking column headers (title, artist, BPM, key, year). |

**Acceptance:** Library remains usable in plan mode (graph collapsed); drag-to-graph correctly anchors and expands; library and graph remain conceptually independent (no auto-filtering of library based on graph state).

### 5.9 Demo States (REQ-DEMO)

A small toggle in the prototype lets the viewer switch between four representative states. The toggle is **prototype-only chrome**, visually distinct from the rest of the UI, labelled "Demo states — prototype only," located in a corner of the window (top-right or bottom-left).

| ID | Priority | Requirement |
|---|---|---|
| **REQ-DEMO-01** | MUST | A demo-state toggle control (pill row or select) is rendered in a corner of the application. It is visually distinct from production UI (e.g., dashed border, lower opacity, or an explicit "DEMO" label). |
| **REQ-DEMO-02** | MUST | The toggle cycles between four states: `happy`, `cold-start`, `sparse-metadata`, `strict-no-results`. |
| **REQ-DEMO-03** | MUST | **Happy state** (default): Both decks loaded with mock tracks, Deck A playing, Deck B cued; queue contains 2–3 items with full metadata; graph is expanded with 7 suggestions; all metadata fields populated. |
| **REQ-DEMO-04** | MUST | **Cold-start state**: No decks loaded (empty deck placeholders shown); queue empty; graph collapsed; the "Show suggestions" bar shows secondary copy "Load a track or drag from your library to begin." |
| **REQ-DEMO-05** | MUST | **Sparse-metadata state**: Anchor track is missing key and tags fields. Anchor node renders available fields and shows "—" for missing ones. Suggestions are produced from the criteria the anchor *does* have data for. Reason chips reflect only the criteria with data. |
| **REQ-DEMO-06** | MUST | **Strict-filters / no-results state**: Engine config is set such that no candidates pass filters. The canvas shows an empty state with copy "No matches in current filters" and a "Loosen filters" button. Clicking the button opens the settings modal with the strictness slider visually focused (e.g., highlighted ring). Pagination controls are hidden. |
| **REQ-DEMO-07** | SHOULD | Switching demo states does not crash, lose state, or produce console errors. The view simply re-renders with the new mock state. |

**Acceptance:** All four states render cleanly, are visually distinguishable, and demonstrate the graceful-degradation patterns described.

### 5.10 Visual Design (REQ-STYLE)

| ID | Priority | Requirement |
|---|---|---|
| **REQ-STYLE-01** | MUST | Foundation is dark with gunmetal-gray surfaces. Background near-black (~#0a0a0a). Panel surfaces in gunmetal grays (~#1a1d22, ~#22262c). |
| **REQ-STYLE-02** | MUST | Subtle metallic gradients on deck chrome and platter rims (linear gradients between gunmetal tones, no chrome-effect kitsch). |
| **REQ-STYLE-03** | MUST | Accent palette is **metallic red and white only**. Metallic red (~#c8302e to ~#a02220 gradient) is reserved for: live-deck glow, anchor-node glow, anchor-source border (selected deck/queue card), page indicator active state, primary button fills. |
| **REQ-STYLE-04** | MUST | White is the primary text colour. White at 60–70% opacity is used for secondary text and reason chip text. |
| **REQ-STYLE-05** | MUST | **No amber, green, or blue accents.** Warning and limit states use a desaturated/dimmer metallic red plus iconography and copy to communicate state. |
| **REQ-STYLE-06** | MUST | Sans-serif (Inter or system stack) is used for all UI text. Monospaced (JetBrains Mono or system mono) is used for numerics: BPM, key (Camelot notation), pitch %, page indicator, durations. |
| **REQ-STYLE-07** | MUST | Depth is conveyed via subtle elevation shadows on draggable elements (suggestion nodes, queue cards, library rows on hover). Borders are **reserved exclusively** for the metallic-red anchor-source treatment. |
| **REQ-STYLE-08** | MUST | The deck row has dense information layout (DJs expect deck-information density). The graph canvas has generous whitespace by contrast. |
| **REQ-STYLE-09** | MUST | The only motion in the application is: (a) the spinning platter on the live deck, (b) standard hover/drag transitions (~150ms), (c) graph collapse/expand transition (~150ms ease). **No animated graph edges, no pulsing nodes, no looping animations.** |

**Acceptance:** A still screenshot of the application reads unambiguously as professional DJ software in a modernised dark style; the live element (live deck, anchor node) draws the eye without dominating; nothing on screen pulses or animates beyond the spinning platter.

---

## 6. Data Model

The application's state is shaped as follows. Implementation may use Zustand, React Context + reducers, or simple `useState` lifted to the root — choice is left to Claude Code's judgement.

### 6.1 Core types

```typescript
// A track in the library or loaded somewhere.
interface Track {
  id: string;                  // unique
  title: string;
  artist: string;
  bpm: number;                 // e.g., 124
  key: string | null;          // Camelot notation, e.g., "8A"; null in sparse-metadata demo
  genre: string;
  tags: string[];              // may be empty in sparse-metadata demo
  year: number;
  energy: number;              // 1-10
  albumArtColor: string;       // hex; the prototype uses solid colour swatches in lieu of real art
  duration?: number;           // seconds; optional, used for the deck waveform width
}

// A virtual deck.
interface Deck {
  id: 'A' | 'B';
  track: Track | null;
  isPlaying: boolean;          // true on Deck A in happy state, false elsewhere
}

// A queue item. Distinct id from the underlying track (so the same track could in
// principle appear twice, e.g., if the DJ is doing something weird).
interface QueueItem {
  id: string;
  track: Track;
}

// The reason a track was suggested for the current anchor.
interface SuggestionReason {
  type: 'artist' | 'key' | 'bpm' | 'genre' | 'tags' | 'year' | 'energy';
  detail: string;              // e.g., "Same artist", "Shared key 8A", "+2 BPM", "Tag: melodic techno"
  strength: number;            // 0-1; engine-internal ranking input
}

// A suggestion = candidate track + matched reasons.
interface Suggestion {
  track: Track;
  reasons: SuggestionReason[]; // sorted by strength desc; first element is the primary
}

// Anchor source — the UI element that supplied the current anchor.
type AnchorSource =
  | { type: 'deck'; deckId: 'A' | 'B' }
  | { type: 'queue'; queueItemId: string }
  | { type: 'library'; trackId: string }
  | { type: 'recursive'; trackId: string };

// Engine configuration.
interface SuggestionConfig {
  enabledCriteria: {
    bpm: boolean;
    key: boolean;
    genre: boolean;
    tags: boolean;
    artist: boolean;
    year: boolean;
    energy: boolean;
  };
  strictness: number;           // 0-100, default 50
  bpmSlowDownPercent: number;   // default 4
  bpmSpeedUpPercent: number;    // default 6
  suggestionsPerPage: number;   // default 7, range 5-12
}

// The graph view's state.
interface GraphState {
  isExpanded: boolean;
  anchorSource: AnchorSource | null;
  anchorTrack: Track | null;    // resolved from anchorSource
  currentPage: number;          // 1-indexed
  pageCache: Map<string, Suggestion[][]>;
                                // key: anchorTrack.id; value: array of pages
}

// The application root state.
interface AppState {
  decks: { A: Deck; B: Deck };
  queue: QueueItem[];
  graph: GraphState;
  config: SuggestionConfig;
  library: Track[];
  demoState: 'happy' | 'cold-start' | 'sparse-metadata' | 'strict-no-results';
  ui: {
    isSettingsModalOpen: boolean;
    isLibraryFiltered: string;  // current search text
  };
}
```

### 6.2 Mock library

The library should contain ~40 mock tracks spanning 3–4 electronic music genres with realistic intra-genre BPM and key distributions. A satisfying default mix is:

- **Melodic techno**: 120–126 BPM, keys clustered 6A–9A
- **Deep house**: 118–124 BPM, keys clustered 4A–8A
- **Progressive house**: 122–128 BPM, keys clustered 7A–11A
- **Drum & bass**: 170–176 BPM (one outlier cluster, mostly excluded by BPM tolerance from the others — useful to demonstrate cross-genre filtering)

The default anchor track for the happy state is a melodic techno track at **124 BPM, key 8A, energy 7, tags `["rolling", "hypnotic", "peak time"]`**. This anchor should yield a candidate pool of ~20–25 tracks under default settings, producing 3–4 pages of pagination.

### 6.3 Suggestion engine algorithm (mock)

The engine is not real ML; it is a deterministic scoring function over the mock library.

For each candidate track in the library (excluding the anchor itself, excluding tracks currently on a deck, excluding tracks already in the queue):

1. **Hard filter — BPM tolerance.** If the candidate's BPM is outside `[anchor.bpm × (1 - slowDown%), anchor.bpm × (1 + speedUp%)]`, the candidate is rejected. (This filter applies when the BPM criterion is enabled.)
2. **Score by enabled criteria.** For each enabled criterion, compute a 0–1 match strength:
   - **BPM**: `1 - (abs(candidate.bpm - anchor.bpm) / maxToleranceBpm)`
   - **Key**: 1.0 if same Camelot key; 0.7 if adjacent on the wheel (e.g., 8A↔9A, 8A↔7A, 8A↔8B); 0 otherwise.
   - **Genre**: 1 if same genre; 0 otherwise.
   - **Tags**: `intersection.size / union.size` (Jaccard).
   - **Artist**: 1 if same artist; 0 otherwise.
   - **Year**: `1 - min(abs(diff)/10, 1)` (decade-scoped).
   - **Energy**: `1 - abs(diff)/9`.
3. **Aggregate.** Total score = mean of the per-criterion scores for enabled criteria.
4. **Apply strictness.** The strictness slider acts as a minimum-score threshold. Strictness 0 (Loose) → threshold 0.3. Strictness 100 (Strict) → threshold 0.7. Linear in between.
5. **Build SuggestionReason list.** Include reasons for criteria that scored ≥0.6. The reason with the highest score is the primary.
6. **Sort and paginate.** Sort surviving candidates by total score descending. Split into pages of N (= `suggestionsPerPage`).

This algorithm is deterministic and inexpensive; it should run on every anchor change or settings change without perceptible delay.

---

## 7. Interaction Reference

### 7.1 Drag-and-drop source-target matrix

| Source ↓ / Target → | Deck A or B | Up Next queue | Graph drop zone | Library |
|---|---|---|---|---|
| **Library row** | Loads track to deck | Adds queue card | Sets anchor + expands graph | n/a (no-op) |
| **Suggestion node** | Loads track to deck | Adds queue card | n/a (already in graph) | n/a |
| **Queue card** | Loads track to deck and removes from queue | Reorders queue | n/a | n/a |

All other drag combinations are no-ops (no error, no visual feedback after release).

### 7.2 Anchor source resolution

When multiple potential anchor sources have been clicked, the **most recent** click wins. Visual indication: only one element at a time displays the metallic-red anchor-source border — exactly the element that supplied the current anchor.

If the anchor source is removed (e.g., the queue card is loaded to a deck and disappears), the anchor itself **persists** — the graph keeps showing suggestions for the same track, but no UI element shows the anchor-source border until a new source is selected.

### 7.3 Click-to-anchor + auto-expand

Every anchor-changing gesture also auto-expands the graph if it is currently collapsed (REQ-GRAPH-12). The DJ never has to "expand the graph" as a separate prerequisite to seeing suggestions.

### 7.4 Manual collapse

The DJ can manually collapse the graph at any time via the drag handle (REQ-LAYOUT-03). Manual collapse retains the anchor; the next auto-expand (via any anchor change) reopens with the same anchor.

---

## 8. Technical Constraints

| ID | Constraint |
|---|---|
| **TECH-01** | Single React artifact, single file. Use functional components with hooks. |
| **TECH-02** | No external network calls. No API, no fetched assets. Album art is rendered as solid colour swatches derived from `track.albumArtColor`. |
| **TECH-03** | No `localStorage`, no `sessionStorage`, no IndexedDB. State is in-memory only. |
| **TECH-04** | Permitted libraries: React, Tailwind core utility classes (no custom Tailwind compilation), `lucide-react` for iconography, `recharts` if a chart is needed (it is not), `lodash` for utility helpers. No drag-and-drop library required — native HTML5 drag-and-drop is sufficient and preferred for this scope. |
| **TECH-05** | No HTML `<form>` tags. Use `onClick` / `onChange` handlers throughout. |
| **TECH-06** | Component should have no required props (default export with internal state). |
| **TECH-07** | No `<DOCTYPE>`, `<html>`, `<head>`, `<body>` tags in artifact output. |
| **TECH-08** | Window is assumed desktop-sized (≥1280px wide). The prototype does not need to be responsive below desktop breakpoints. |
| **TECH-09** | Mock data is hardcoded as a constant in the artifact source — no JSON imports, no fetches. |
| **TECH-10** | Use Tailwind core utilities for styling. Custom colours (gunmetal grays, metallic red) must be expressed via inline `style` attributes or arbitrary value Tailwind syntax (e.g., `bg-[#1a1d22]`). |

---

## 9. Dependency Notes (Guidance for Phasing)

This section surfaces the natural dependency graph between feature areas. It is **not** a prescribed phase plan — Claude Code should produce its own phasing — but it makes the natural seams visible.

### 9.1 Foundational (nothing depends on the rest of this list)

- **Data model and mock library** (Section 6). Required by everything else.
- **Visual design tokens** (REQ-STYLE-01..09 as a reusable theme): palette, typography, spacing constants. Used by every component.
- **Layout shell** (REQ-LAYOUT-01..06): the three-band structure with the tab strip and drag handle. Empty placeholders in each band.

### 9.2 Independent verticals (depend only on the foundation)

- **Deck row** (REQ-DECK-01..10) — depends on data model + style tokens. Does **not** depend on graph or queue.
- **Library** (REQ-LIB-01..08) — depends on data model + style tokens. Does **not** depend on graph or queue.

### 9.3 Graph view core (depends on decks and queue being click sources)

- **Queue strip** (REQ-QUEUE-01..13) — depends on data model + style tokens. Becomes more useful once the graph exists, but can be built and tested independently with drag-from-library.
- **Graph canvas: anchor system** (REQ-GRAPH-01..15) — depends on data model + decks + queue (because clicking either is an anchor source).
- **Graph header** (REQ-HEADER-01..04) — depends on graph canvas being expanded.
- **Suggestion engine algorithm** (Section 6.3, REQ-SUGGEST-01..10) — depends on data model. Independent of UI; can be implemented as a pure function and unit-tested first.
- **Suggestion settings modal** (REQ-SUGGEST-07) — depends on the engine and the gear icon in the header.

### 9.4 Graph view enrichments (depend on the core)

- **Pagination** (REQ-PAGE-01..08) — depends on the engine and the header.
- **Reason chips and recursive anchoring** (REQ-GRAPH-06, 07, 11) — depends on suggestions rendering.

### 9.5 Polish and validation (depend on most of the above)

- **Drag-and-drop integration across all source/target pairs** (Section 7.1) — depends on every source and target existing.
- **Demo states toggle** (REQ-DEMO-01..07) — depends on essentially all features being implementable in degraded form. Best built last as a comprehensive integration test of the rest of the system.

### 9.6 A natural minimum-viable-prototype path

If Claude Code wants to ship a usable demo at the earliest point and add features iteratively, the shortest path is:

1. Foundation + style tokens + layout shell → empty bands visible.
2. Mock data + library + decks → can drag tracks to decks.
3. Queue strip (drop target only, no click-to-anchor) → can plan a list.
4. Graph canvas with happy-state hardcoded suggestions (no engine) → can see graph shape and drag suggestion nodes to deck/queue.
5. Real suggestion engine + settings modal → suggestions are dynamic.
6. Click-to-anchor on decks and queue cards → recursive walking works.
7. Pagination → Prev/Next functional.
8. Demo states toggle → cold-start / sparse / no-results coverage.

This path means features 1–4 produce a useful-looking prototype within ~40% of the total work, and each subsequent step compounds on a working baseline.

---

## 10. Open Questions

None at the time of writing. All design decisions resolved during the structured design session.

---

## 11. Appendix: Out-of-Scope Future Considerations

These are explicitly **not** part of the prototype but are noted because they may inform implementation choices that don't preclude them later.

- **Real audio + sync engine.** Production version would integrate with Web Audio API or a native DJ-software audio backend.
- **Real metadata extraction.** Production version would parse ID3 / MP4 metadata or integrate with services like Mixed In Key.
- **Persistence and crates.** Production "Crates" tab would persist user-curated playlists across sessions.
- **History tab.** Production "History" tab would log every loaded track with timestamp.
- **Browse tab.** Production "Browse" tab is the conventional list-view alternative to the graph.
- **Multi-deck (4-deck) support.** Some DJs use four decks; the graph would need a deck-selection mechanism.
- **Touch/iPad interaction.** The recursive graph-walk model is a strong fit for touch but the prototype is desktop-only.
- **Collaborative / B2B sets.** Two DJs sharing a graph view in a back-to-back set.
- **Harmonic-mixing visualisations.** Beyond reason chips, the graph could colour edges by key compatibility on a Camelot-wheel hue system.
- **Energy-arc planning.** A timeline view showing the queue's projected energy trajectory.

These are noted only so Claude Code does not architecturally close them off (e.g., by hardcoding "two decks" in places where a small refactor could support four). Avoiding lock-in is a tiebreaker, not a priority.