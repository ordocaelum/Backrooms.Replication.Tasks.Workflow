# Backrooms Task Replication — Workflow

This repository now ships a **dark-theme, diagram-first documentation site** for the Backrooms task replication system.

The documentation focuses on:
- **Authoritative GameState task replication**
- **RPC call flow across client/server boundaries**
- **Section-aware anchor placement/pickup behavior using existing GS/GM counters**
- **Widget refresh paths driven by replicated state**

---

## 🚀 Start Here

- **Landing page:** [`index.html`](index.html)
- **Primary workflow overview:** [`docs/workflow-overview.html`](docs/workflow-overview.html)

---

## 📄 Redesigned Documentation Pages

| Page | Purpose |
|------|---------|
| [Landing](index.html) | Hero overview, quick system map, and navigation hub |
| [Workflow Overview](docs/workflow-overview.html) | System-level SVG, blueprint role cards, 3-step flow |
| [Section Tasks Flow](docs/section-tasks-flow.html) | Placement vs pickup revert vs pickup no-revert (3-column comparison) |
| [RPC Call Paths](docs/rpc-call-paths.html) | `Server_ReportTaskCompleted` and `RevertTaskProgress_RPC` timelines |
| [GameState Authority](docs/gamestate-authority.html) | Replicated variable table, RepNotify and migration mapping |
| [UI Widget Flow](docs/ui-widget-flow.html) | WBP_Inventory casting, OnRep update path, widget structure |
| [Quick Reference](docs/quick-reference.html) | Blueprint lookup, variable summary, RPC links, migration checklist |

---

## 🎨 Shared Styling System

All redesigned pages use shared styles from:

- [`docs/shared/style.css`](docs/shared/style.css) — color tokens, typography, cards, tables, forms
- [`docs/shared/layout.css`](docs/shared/layout.css) — sticky nav, responsive grids, layout helpers
- [`docs/shared/diagrams.css`](docs/shared/diagrams.css) — SVG nodes, flow arrows, legends, diagram interactions
- [`docs/shared/animations.css`](docs/shared/animations.css) — subtle fade/hover transitions

---

## Color Coding

- **GameState:** `#3b82f6`
- **GameMode:** `#22c55e`
- **PlayerState / RPC emphasis:** `#f97316`
- **Task items / revert emphasis:** `#ef4444`
- **UI widgets:** `#a855f7`
- **Primary background:** `#0a0a0a`

---

## Notes

- The redesign intentionally replaces text-heavy markdown flows with embedded SVG diagrams and card-based navigation.
- Existing legacy documentation files remain in the repository for historical reference.
