# Backrooms Task Replication — Workflow

This repository documents the Blueprint architecture for the **Backrooms Task Replication** system in Unreal Engine.

All authoritative task state (task lists, per-task progress, and globally completed task IDs) lives in **`BP_GS_Gameplay` (GameState)**, which replicates to all clients automatically. Widgets and task items query GameState directly instead of PlayerState.

---

## 📄 Documentation

| Page | Description |
|------|-------------|
| [Architecture Diagram](docs/architecture-diagram.md) | High-level layered workflow diagram with component contents, RPC flow, and replication path |
| [Section Task Completion](docs/section-task-completion.md) | Section-aware anchor placement/pickup rules using existing GS/GM counters and revert RPC flow |
| [**Overview**](docs/task-replication-workflow.html) | Top-level system diagram and blueprint role summary |
| [GameState Task Logic](docs/task-replication-workflow/gamestate-task-logic.html) | Replicated variables, RepNotify setup, and migration from PlayerState |
| [Widget / UI Path](docs/task-replication-workflow/widget-ui-path.html) | WBP_Inventory and task rows — casting to GameState instead of PlayerState |
| [BP_Task_Item_Base](docs/task-replication-workflow/task-item-base.html) | In-world interaction, RPC bridging, and the server progress path |
| [Inter-Blueprint Call Map](docs/task-replication-workflow/inter-blueprint-call-map.html) | Complete event and function call graph across all blueprints |

> **Start here:** [`docs/task-replication-workflow.html`](docs/task-replication-workflow.html)

---

## Architecture at a Glance

```
Player interacts with BP_Task_Item_Base
  → Client: FlipFlop check → local FX
  → Client: PlayerState.Server_ReportTaskCompleted(TaskID)  [RPC]
      → Server: GameMode.OnTaskCompleted(TaskID)
          → Server: GameState.GloballyCompletedTaskIDs += TaskID  [RepNotify]
              → All Clients: OnRep_CompletedTaskIDs
                  → HUD / WBP_Inventory refreshes
```

### Key Blueprints

| Blueprint | Network | Role |
|-----------|---------|------|
| `BP_Task_Item_Base` | Actor (replicated) | Detects interaction; fires server RPC |
| `BP_PS_Gameplay` | PlayerState | Hosts `Server_ReportTaskCompleted` RPC |
| `BP_GM_Gameplay` | GameMode (server-only) | Validates completion; writes to GameState |
| **`BP_GS_Gameplay`** | **GameState (replicated)** | **Authoritative task data for all clients** |
| `WBP_Inventory` | Widget (local) | Casts to **GameState** for task lists/progress |

---

## Migration Note

Any Blueprint node that previously cast to **`BP_PS_Gameplay`** to read task data must be updated:

```
OLD: Get Player State → Cast to BP_PS_Gameplay → Get ActiveTasksList
NEW: Get Game State   → Cast to BP_GS_Gameplay → Get ActiveTasksList
```

See the [Widget / UI Path](docs/task-replication-workflow/widget-ui-path.html) page for the full node-by-node diff.
