class MasterTree {
  constructor() {
    this.svg = document.getElementById("masterTreeSvg");
    this.viewport = document.getElementById("treeViewport");
    this.group = document.getElementById("viewportGroup");
    this.detailPanel = document.getElementById("detailPanel");
    this.detailContent = document.getElementById("detailContent");

    this.searchInput = document.getElementById("treeSearch");
    this.searchNextButton = document.getElementById("searchNext");
    this.resetHighlightsButton = document.getElementById("resetHighlights");

    this.nodeWidth = 280;
    this.nodeHeight = 84;
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.minScale = 0.45;
    this.maxScale = 2.2;
    this.dragging = false;
    this.lastPoint = { x: 0, y: 0 };
    this.selectedNodeId = null;
    this.searchResults = [];
    this.searchIndex = 0;

    this.sections = this.createSections();
    this.nodes = this.createNodes();
    this.edges = this.createEdges();
    this.nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    this.nodeElements = new Map();
    this.edgeElements = new Map();

    this.buildTree();
    this.bindEvents();
    this.fitToWidth();
    this.restoreFromHash();
  }

  createSections() {
    return [
      {
        id: "section-1",
        title: "SECTION 1: ANCHOR PLACEMENT (Section Incomplete)",
        subtitle: "Placement completes a task and replicates progress.",
        y: 70,
        height: 940,
      },
      {
        id: "section-2",
        title: "SECTION 2: ANCHOR PICKUP REVERT (Section Still Incomplete)",
        subtitle: "Pickup reverts task when CompletedTaskCount < RequiredTaskCount.",
        y: 1060,
        height: 900,
      },
      {
        id: "section-3",
        title: "SECTION 3: ANCHOR PICKUP NO-REVERT (Section Complete)",
        subtitle: "Pickup does not revert once section is complete (locked).",
        y: 2010,
        height: 760,
      },
    ];
  }

  createNodes() {
    return [
      {
        id: "s1_anchor_placed",
        section: "section-1",
        x: 220,
        y: 140,
        label: "Anchor Placed at Location",
        subtitle: "Entry state",
        type: "event",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Local / client interaction",
        details: {
          functionName: "OnDropped(FVector Location)",
          scope: "All (triggered by local interaction)",
          reliable: "No",
          parameters: ["Location (FVector)"],
          variables: [
            "bIsPlaced (Boolean) — set true when anchor is placed",
            "AssociatedTaskID (FName) — routes completion to task pipeline",
          ],
          codeSnippet: `Event OnDropped(Location)\n  bIsPlaced = true\n  Server_ReportTaskCompleted(AssociatedTaskID)`,
          related: [
            { id: "s1_on_dropped", direction: "outgoing" },
          ],
          keyLogic: [
            "Starts placement completion flow.",
            "Forwards AssociatedTaskID toward authoritative server path.",
          ],
        },
      },
      {
        id: "s1_on_dropped",
        section: "section-1",
        x: 220,
        y: 260,
        label: "BP_RealityAnchor_Dropped::OnDropped",
        subtitle: "Local event",
        type: "event",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Local call",
        details: {
          functionName: "OnDropped(FVector Location)",
          scope: "Client",
          reliable: "No",
          parameters: ["Location (FVector)"],
          variables: [
            "AssociatedTaskID (FName) — task linked to dropped anchor",
            "bIsPlaced (Boolean) — confirms active placed state",
          ],
          codeSnippet: `Event OnDropped(Location)\n  if (bIsPlaced)\n    BP_PS_Gameplay::Server_ReportTaskCompleted(AssociatedTaskID)`,
          related: [
            { id: "s1_anchor_placed", direction: "incoming" },
            { id: "s1_server_report", direction: "outgoing" },
          ],
          keyLogic: ["Bridges anchor interaction into RPC bridge."],
        },
      },
      {
        id: "s1_server_report",
        section: "section-1",
        x: 220,
        y: 380,
        label: "Server_ReportTaskCompleted(TaskID)",
        subtitle: "Server RPC",
        type: "rpc",
        blueprint: "BP_PS_Gameplay",
        networkRole: "Server RPC (Reliable)",
        details: {
          functionName: "Server_ReportTaskCompleted(FName TaskID)",
          scope: "Server",
          reliable: "Yes",
          parameters: ["TaskID (FName)"],
          variables: ["TaskID (FName) — forwarded to GameMode authority"],
          codeSnippet: `Server_ReportTaskCompleted(TaskID) [Reliable Server RPC]\n  BP_GM_Gameplay::OnTaskCompleted(TaskID)`,
          related: [
            { id: "s1_on_dropped", direction: "incoming" },
            { id: "s1_gm_completed", direction: "outgoing" },
          ],
          keyLogic: ["Reliable client-to-server bridge for task completion."],
        },
      },
      {
        id: "s1_gm_completed",
        section: "section-1",
        x: 220,
        y: 500,
        label: "BP_GM_Gameplay::OnTaskCompleted",
        subtitle: "Validate + route",
        type: "decision",
        blueprint: "BP_GM_Gameplay",
        networkRole: "Server authority",
        details: {
          functionName: "OnTaskCompleted(FName TaskID)",
          scope: "Server",
          reliable: "N/A",
          parameters: ["TaskID (FName)"],
          variables: [
            "CompletedTaskCount (Integer) — synchronized authority counter",
            "RequiredTaskCount (Integer) — section completion threshold",
          ],
          codeSnippet: `Function OnTaskCompleted(TaskID)\n  Validate TaskID + deduplicate\n  if task already complete -> return\n  BP_GS_Gameplay::IncrementTaskProgress(TaskID)\n  CheckWinCondition()`,
          related: [
            { id: "s1_server_report", direction: "incoming" },
            { id: "s1_gs_increment", direction: "outgoing" },
          ],
          keyLogic: [
            "Prevents duplicate completion and keeps server authority centralized.",
            "Routes successful completion into replicated GameState state.",
          ],
        },
      },
      {
        id: "s1_gs_increment",
        section: "section-1",
        x: 220,
        y: 620,
        label: "BP_GS_Gameplay::IncrementTaskProgress",
        subtitle: "Server write + RepNotify source",
        type: "function",
        blueprint: "BP_GS_Gameplay",
        networkRole: "Replicated GameState write",
        details: {
          functionName: "IncrementTaskProgress(FName TaskID)",
          scope: "Server",
          reliable: "N/A",
          parameters: ["TaskID (FName)"],
          variables: [
            "ActiveTasksItems (Array<BP_Task_Item_Base>) — find task by TaskID",
            "CompletedTasksOfTaskIds (Array<FName>) — append TaskID",
            "CompletedTaskCount (Integer, RepNotify) — increment",
            "TotalProgress (Integer) — increment cumulative progress",
            "RequiredTaskCount (Integer) — compare threshold",
          ],
          codeSnippet: `Function IncrementTaskProgress(TaskID)\n  Task = Find ActiveTasksItems by TaskID\n  Mark Task as COMPLETED\n  CompletedTaskCount++   // RepNotify\n  TotalProgress++\n  CompletedTasksOfTaskIds.Add(TaskID)\n  if CompletedTaskCount >= RequiredTaskCount -> Section COMPLETE`,
          related: [
            { id: "s1_gm_completed", direction: "incoming" },
            { id: "s1_count_check", direction: "outgoing" },
            { id: "s1_repnotify", direction: "outgoing" },
          ],
          keyLogic: [
            "Single source of truth for task completion and progress replication.",
            "RepNotify fans out updates to all clients.",
          ],
        },
      },
      {
        id: "s1_count_check",
        section: "section-1",
        x: 220,
        y: 740,
        label: "CompletedTaskCount >= RequiredTaskCount?",
        subtitle: "Section gate",
        type: "check",
        blueprint: "BP_GS_Gameplay",
        networkRole: "Server check",
        details: {
          functionName: "Section completion condition",
          scope: "Server",
          reliable: "N/A",
          parameters: ["CompletedTaskCount (Integer)", "RequiredTaskCount (Integer)"],
          variables: [
            "CompletedTaskCount (Integer) — current replicated counter",
            "RequiredTaskCount (Integer) — required completion count",
          ],
          codeSnippet: `if CompletedTaskCount >= RequiredTaskCount\n  section = COMPLETE (locked)\nelse\n  section remains active`,
          related: [
            { id: "s1_gs_increment", direction: "incoming" },
            { id: "s1_section_complete", direction: "outgoing" },
            { id: "s1_section_active", direction: "outgoing" },
          ],
          keyLogic: ["Defines lock state that controls later pickup revert eligibility."],
        },
      },
      {
        id: "s1_section_complete",
        section: "section-1",
        x: 700,
        y: 860,
        label: "Section COMPLETE (locked)",
        subtitle: "YES branch",
        type: "decision",
        blueprint: "BP_GM_Gameplay",
        networkRole: "Server state",
        details: {
          functionName: "CheckWinCondition()",
          scope: "Server",
          reliable: "N/A",
          parameters: ["None"],
          variables: [
            "CompletedTaskCount (Integer)",
            "RequiredTaskCount (Integer)",
          ],
          codeSnippet: `Function CheckWinCondition()\n  if CompletedTaskCount >= RequiredTaskCount\n    Lock section completion state`,
          related: [{ id: "s1_count_check", direction: "incoming" }],
          keyLogic: ["Section lock prevents pickup revert in section 3 path."],
        },
      },
      {
        id: "s1_section_active",
        section: "section-1",
        x: 220,
        y: 860,
        label: "Section still active",
        subtitle: "NO branch",
        type: "decision",
        blueprint: "BP_GS_Gameplay",
        networkRole: "Replicated state",
        details: {
          functionName: "Section incomplete path",
          scope: "Server + clients",
          reliable: "N/A",
          parameters: ["None"],
          variables: ["CompletedTaskCount (Integer)", "RequiredTaskCount (Integer)"],
          codeSnippet: `Section remains active\ncontinue processing replicated updates`,
          related: [
            { id: "s1_count_check", direction: "incoming" },
            { id: "s1_repnotify", direction: "outgoing" },
          ],
          keyLogic: ["Incomplete sections can still revert on anchor pickup."],
        },
      },
      {
        id: "s1_repnotify",
        section: "section-1",
        x: 220,
        y: 980,
        label: "OnRep_CompletedTaskCount()",
        subtitle: "RepNotify on all clients",
        type: "function",
        blueprint: "BP_GS_Gameplay",
        networkRole: "RepNotify callback",
        details: {
          functionName: "OnRep_CompletedTaskCount()",
          scope: "Clients",
          reliable: "N/A",
          parameters: ["None"],
          variables: ["CompletedTaskCount (Integer, RepNotify) — changed value"],
          codeSnippet: `OnRep_CompletedTaskCount()\n  Broadcast / bind UI refresh updates`,
          related: [
            { id: "s1_section_active", direction: "incoming" },
            { id: "s1_widget_refresh", direction: "outgoing" },
            { id: "s2_revert_rpc", direction: "incoming" },
          ],
          keyLogic: ["Client-side entry point for tablet progress refresh."],
        },
      },
      {
        id: "s1_widget_refresh",
        section: "section-1",
        x: 220,
        y: 1100,
        label: "WBP_Inventory::RefreshTaskList",
        subtitle: "UI update",
        type: "event",
        blueprint: "WBP_Inventory",
        networkRole: "Client UI",
        details: {
          functionName: "RefreshTaskList() / OnRep_Update_Binding()",
          scope: "Clients",
          reliable: "N/A",
          parameters: ["None"],
          variables: [
            "ActiveTasksItems (Array<BP_Task_Item_Base>) — read for row rebuild",
            "CompletedTaskCount (Integer) — read for display",
          ],
          codeSnippet: `OnRep_Update_Binding -> RefreshTaskList()\nCast BP_GS_Gameplay\nRead ActiveTasksItems[]\nRebuild UI rows`,
          related: [
            { id: "s1_repnotify", direction: "incoming" },
            { id: "s2_widget_refresh", direction: "incoming" },
          ],
          keyLogic: ["Tablet UI mirrors replicated task progress in real time."],
        },
      },
      {
        id: "s2_anchor_pickup",
        section: "section-2",
        x: 220,
        y: 1180,
        label: "Anchor Picked Up",
        subtitle: "Section still incomplete",
        type: "event",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Local / client interaction",
        details: {
          functionName: "OnPickup()",
          scope: "Client",
          reliable: "No",
          parameters: ["None"],
          variables: ["AssociatedTaskID (FName) — candidate task for revert"],
          codeSnippet: `Event OnPickup()\n  if CanRevertTaskOnPickup(AssociatedTaskID)\n    RevertTaskProgress_RPC(AssociatedTaskID)`,
          related: [{ id: "s2_on_pickup", direction: "outgoing" }],
          keyLogic: ["Starts pickup path while section is not yet complete."],
        },
      },
      {
        id: "s2_on_pickup",
        section: "section-2",
        x: 220,
        y: 1300,
        label: "BP_RealityAnchor_Dropped::OnPickup",
        subtitle: "Local event",
        type: "event",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Local call",
        details: {
          functionName: "OnPickup()",
          scope: "Client",
          reliable: "No",
          parameters: ["None"],
          variables: [
            "AssociatedTaskID (FName)",
            "bIsPlaced (Boolean) — toggles when anchor is lifted",
          ],
          codeSnippet: `Event OnPickup()\n  bIsPlaced = false\n  bool bCanRevert = CanRevertTaskOnPickup(AssociatedTaskID)`,
          related: [
            { id: "s2_anchor_pickup", direction: "incoming" },
            { id: "s2_can_revert", direction: "outgoing" },
          ],
          keyLogic: ["Runs revert eligibility check before RPC."],
        },
      },
      {
        id: "s2_can_revert",
        section: "section-2",
        x: 220,
        y: 1420,
        label: "CanRevertTaskOnPickup(TaskID)",
        subtitle: "Wrapper + GS check",
        type: "check",
        blueprint: "BP_GS_Gameplay",
        networkRole: "Local read against replicated counters",
        details: {
          functionName: "CanRevertTaskOnPickup(FName TaskID) -> Bool",
          scope: "Client/All",
          reliable: "N/A",
          parameters: ["TaskID (FName)"],
          variables: [
            "CompletedTaskCount (Integer) — read",
            "RequiredTaskCount (Integer) — read",
          ],
          codeSnippet: `Function CanRevertTaskOnPickup(TaskID)\n  return CompletedTaskCount < RequiredTaskCount`,
          related: [
            { id: "s2_on_pickup", direction: "incoming" },
            { id: "s2_decision", direction: "outgoing" },
            { id: "s3_can_revert", direction: "outgoing" },
          ],
          keyLogic: [
            "Core lock gate shared by revert and no-revert branches.",
            "True only while section is incomplete.",
          ],
        },
      },
      {
        id: "s2_decision",
        section: "section-2",
        x: 220,
        y: 1540,
        label: "CONDITION: Can Revert?",
        subtitle: "Decision (expect YES)",
        type: "decision",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Branching logic",
        details: {
          functionName: "Branch on CanRevertTaskOnPickup result",
          scope: "Client",
          reliable: "N/A",
          parameters: ["bCanRevert (Boolean)"],
          variables: ["bCanRevert (Boolean) — from CanRevertTaskOnPickup"],
          codeSnippet: `if bCanRevert\n  BP_GS_Gameplay::RevertTaskProgress_RPC(TaskID)\nelse\n  // impossible in section 2 context`,
          related: [
            { id: "s2_can_revert", direction: "incoming" },
            { id: "s2_revert_rpc", direction: "outgoing" },
            { id: "s2_impossible_no", direction: "outgoing" },
          ],
          keyLogic: ["Section 2 path should route into server RPC revert."],
        },
      },
      {
        id: "s2_revert_rpc",
        section: "section-2",
        x: 220,
        y: 1660,
        label: "RevertTaskProgress_RPC(TaskID)",
        subtitle: "Server RPC revert",
        type: "revert",
        blueprint: "BP_GS_Gameplay",
        networkRole: "Server RPC (Reliable)",
        details: {
          functionName: "RevertTaskProgress_RPC(FName TaskID)",
          scope: "Server",
          reliable: "Yes",
          parameters: ["TaskID (FName)"],
          variables: [
            "ActiveTasksItems (Array<BP_Task_Item_Base>) — remove/mark INCOMPLETE",
            "CompletedTasksOfTaskIds (Array<FName>) — remove TaskID",
            "CompletedTaskCount (Integer, RepNotify) — decrement",
            "TotalProgress (Integer) — decrement",
          ],
          codeSnippet: `Server RPC RevertTaskProgress_RPC(TaskID)\n  Find task by TaskID in ActiveTasksItems\n  Mark task INCOMPLETE / remove tracking\n  CompletedTaskCount--   // RepNotify\n  TotalProgress--\n  CompletedTasksOfTaskIds.Remove(TaskID)`,
          related: [
            { id: "s2_decision", direction: "incoming" },
            { id: "s1_repnotify", direction: "outgoing" },
            { id: "s2_widget_refresh", direction: "outgoing" },
          ],
          keyLogic: [
            "Reverts incomplete-section pickup progress on server authority.",
            "RepNotify cascades to clients for visible tablet rollback.",
          ],
        },
      },
      {
        id: "s2_widget_refresh",
        section: "section-2",
        x: 220,
        y: 1780,
        label: "WBP_Inventory refreshes",
        subtitle: "Tablet shows task reverted",
        type: "event",
        blueprint: "WBP_Inventory",
        networkRole: "Client UI",
        details: {
          functionName: "RefreshTaskList()",
          scope: "Clients",
          reliable: "N/A",
          parameters: ["None"],
          variables: [
            "ActiveTasksItems (Array<BP_Task_Item_Base>)",
            "CompletedTaskCount (Integer)",
          ],
          codeSnippet: `OnRep_CompletedTaskCount()\n  WBP_Inventory::RefreshTaskList()\n  Tablet now shows reverted task state`,
          related: [
            { id: "s2_revert_rpc", direction: "incoming" },
            { id: "s1_widget_refresh", direction: "related" },
          ],
          keyLogic: ["Visual confirmation that revert propagated to all clients."],
        },
      },
      {
        id: "s2_impossible_no",
        section: "section-2",
        x: 700,
        y: 1660,
        label: "NO branch (impossible here)",
        subtitle: "Section 2 expectation",
        type: "decision",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Not expected in this section",
        details: {
          functionName: "Branch fallback",
          scope: "Client",
          reliable: "N/A",
          parameters: ["None"],
          variables: ["N/A"],
          codeSnippet: `Section 2 is defined as incomplete state\nNO branch should not be entered here`,
          related: [{ id: "s2_decision", direction: "incoming" }],
          keyLogic: ["Documented as impossible branch for this section."],
        },
      },
      {
        id: "s3_anchor_pickup",
        section: "section-3",
        x: 220,
        y: 2140,
        label: "Anchor Picked Up",
        subtitle: "Section already complete",
        type: "event",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Local / client interaction",
        details: {
          functionName: "OnPickup()",
          scope: "Client",
          reliable: "No",
          parameters: ["None"],
          variables: ["AssociatedTaskID (FName)"],
          codeSnippet: `Event OnPickup()\n  bCanRevert = CanRevertTaskOnPickup(AssociatedTaskID)`,
          related: [{ id: "s3_on_pickup", direction: "outgoing" }],
          keyLogic: ["Same entry as section 2 but lock state differs."],
        },
      },
      {
        id: "s3_on_pickup",
        section: "section-3",
        x: 220,
        y: 2260,
        label: "BP_RealityAnchor_Dropped::OnPickup",
        subtitle: "Local event",
        type: "event",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Local call",
        details: {
          functionName: "OnPickup()",
          scope: "Client",
          reliable: "No",
          parameters: ["None"],
          variables: ["AssociatedTaskID (FName)", "bIsPlaced (Boolean)"],
          codeSnippet: `Event OnPickup()\n  bool bCanRevert = CanRevertTaskOnPickup(AssociatedTaskID)`,
          related: [
            { id: "s3_anchor_pickup", direction: "incoming" },
            { id: "s3_can_revert", direction: "outgoing" },
          ],
          keyLogic: ["Calls the same gate helper used in section 2."],
        },
      },
      {
        id: "s3_can_revert",
        section: "section-3",
        x: 220,
        y: 2380,
        label: "CanRevertTaskOnPickup(TaskID)",
        subtitle: "Returns false",
        type: "check",
        blueprint: "BP_GS_Gameplay",
        networkRole: "Replicated counter read",
        details: {
          functionName: "CanRevertTaskOnPickup(FName TaskID) -> Bool",
          scope: "Client/All",
          reliable: "N/A",
          parameters: ["TaskID (FName)"],
          variables: [
            "CompletedTaskCount (Integer)",
            "RequiredTaskCount (Integer)",
          ],
          codeSnippet: `CompletedTaskCount < RequiredTaskCount\n=> false in complete section`,
          related: [
            { id: "s3_on_pickup", direction: "incoming" },
            { id: "s3_decision", direction: "outgoing" },
          ],
          keyLogic: ["Section completion lock blocks revert path."],
        },
      },
      {
        id: "s3_decision",
        section: "section-3",
        x: 220,
        y: 2500,
        label: "CONDITION: Can Revert?",
        subtitle: "Decision (expect NO)",
        type: "decision",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Branching logic",
        details: {
          functionName: "Branch on bCanRevert",
          scope: "Client",
          reliable: "N/A",
          parameters: ["bCanRevert (Boolean)"],
          variables: ["bCanRevert (Boolean)"],
          codeSnippet: `if !bCanRevert\n  keep task COMPLETED\n  no RevertTaskProgress_RPC`,
          related: [
            { id: "s3_can_revert", direction: "incoming" },
            { id: "s3_locked_no_revert", direction: "outgoing" },
            { id: "s3_impossible_yes", direction: "outgoing" },
          ],
          keyLogic: ["Expected section 3 path: NO branch only."],
        },
      },
      {
        id: "s3_locked_no_revert",
        section: "section-3",
        x: 220,
        y: 2620,
        label: "Section complete: NO REVERT",
        subtitle: "Task stays completed",
        type: "decision",
        blueprint: "BP_GS_Gameplay",
        networkRole: "No replication delta",
        details: {
          functionName: "Locked complete section behavior",
          scope: "Client + server state unchanged",
          reliable: "N/A",
          parameters: ["None"],
          variables: [
            "CompletedTaskCount (Integer) — unchanged",
            "RequiredTaskCount (Integer) — already met",
          ],
          codeSnippet: `Task remains COMPLETED\nAnchor is free to move\nNo RevertTaskProgress_RPC\nNo OnRep/UI delta`,
          related: [
            { id: "s3_decision", direction: "incoming" },
            { id: "s3_no_ui_change", direction: "outgoing" },
          ],
          keyLogic: [
            "Once section is complete, pickup should not mutate replicated counters.",
            "Anchor remains movable while completion state stays locked.",
          ],
        },
      },
      {
        id: "s3_no_ui_change",
        section: "section-3",
        x: 220,
        y: 2740,
        label: "No UI change",
        subtitle: "No new replication",
        type: "event",
        blueprint: "WBP_Inventory",
        networkRole: "Client UI unchanged",
        details: {
          functionName: "No RefreshTaskList trigger",
          scope: "Clients",
          reliable: "N/A",
          parameters: ["None"],
          variables: ["CompletedTaskCount (Integer) — unchanged"],
          codeSnippet: `No RepNotify event fired\nUI remains unchanged`,
          related: [{ id: "s3_locked_no_revert", direction: "incoming" }],
          keyLogic: ["No data mutation means no tablet refresh."],
        },
      },
      {
        id: "s3_impossible_yes",
        section: "section-3",
        x: 700,
        y: 2620,
        label: "YES branch (impossible here)",
        subtitle: "Section 3 expectation",
        type: "decision",
        blueprint: "BP_RealityAnchor_Dropped",
        networkRole: "Not expected in this section",
        details: {
          functionName: "Branch fallback",
          scope: "Client",
          reliable: "N/A",
          parameters: ["None"],
          variables: ["N/A"],
          codeSnippet: `Section 3 is complete and locked\nYES branch should not be entered`,
          related: [{ id: "s3_decision", direction: "incoming" }],
          keyLogic: ["Documented impossible branch for complete section."],
        },
      },
    ];
  }

  createEdges() {
    return [
      { id: "e1", from: "s1_anchor_placed", to: "s1_on_dropped", type: "local", label: "Local Event" },
      { id: "e2", from: "s1_on_dropped", to: "s1_server_report", type: "rpc", label: "Server RPC" },
      { id: "e3", from: "s1_server_report", to: "s1_gm_completed", type: "server", label: "Server Call" },
      { id: "e4", from: "s1_gm_completed", to: "s1_gs_increment", type: "server", label: "Server Write" },
      { id: "e5", from: "s1_gs_increment", to: "s1_count_check", type: "server", label: "Threshold check" },
      { id: "e6", from: "s1_count_check", to: "s1_section_complete", type: "server", label: "YES" },
      { id: "e7", from: "s1_count_check", to: "s1_section_active", type: "local", label: "NO" },
      { id: "e8", from: "s1_section_active", to: "s1_repnotify", type: "replication", label: "RepNotify" },
      { id: "e9", from: "s1_repnotify", to: "s1_widget_refresh", type: "replication", label: "Widget update" },

      { id: "e10", from: "s2_anchor_pickup", to: "s2_on_pickup", type: "local", label: "Local Event" },
      { id: "e11", from: "s2_on_pickup", to: "s2_can_revert", type: "local", label: "Local Check" },
      { id: "e12", from: "s2_can_revert", to: "s2_decision", type: "local", label: "Boolean" },
      { id: "e13", from: "s2_decision", to: "s2_revert_rpc", type: "rpc", label: "YES" },
      { id: "e14", from: "s2_decision", to: "s2_impossible_no", type: "revert", label: "NO (impossible)" },
      { id: "e15", from: "s2_revert_rpc", to: "s1_repnotify", type: "replication", label: "RepNotify" },
      { id: "e16", from: "s1_repnotify", to: "s2_widget_refresh", type: "replication", label: "UI rollback" },

      { id: "e17", from: "s3_anchor_pickup", to: "s3_on_pickup", type: "local", label: "Local Event" },
      { id: "e18", from: "s3_on_pickup", to: "s3_can_revert", type: "local", label: "Local Check" },
      { id: "e19", from: "s3_can_revert", to: "s3_decision", type: "local", label: "Boolean" },
      { id: "e20", from: "s3_decision", to: "s3_locked_no_revert", type: "server", label: "NO" },
      { id: "e21", from: "s3_locked_no_revert", to: "s3_no_ui_change", type: "local", label: "No replication" },
      { id: "e22", from: "s3_decision", to: "s3_impossible_yes", type: "revert", label: "YES (impossible)" },
    ];
  }

  buildTree() {
    this.group.innerHTML = "";
    const sectionLayer = this.createSvgElement("g", { id: "sectionLayer" });
    const edgeLayer = this.createSvgElement("g", { id: "edgeLayer" });
    const nodeLayer = this.createSvgElement("g", { id: "nodeLayer" });

    this.sections.forEach((section) => {
      const sectionRect = this.createSvgElement("rect", {
        x: 40,
        y: section.y,
        width: 1280,
        height: section.height,
        class: "section-band",
      });
      const title = this.createSvgElement("text", {
        x: 70,
        y: section.y + 34,
        class: "section-title",
      });
      title.textContent = section.title;
      const subtitle = this.createSvgElement("text", {
        x: 70,
        y: section.y + 58,
        class: "node-sub",
      });
      subtitle.textContent = section.subtitle;
      sectionLayer.append(sectionRect, title, subtitle);
    });

    this.edges.forEach((edge) => {
      const from = this.nodeMap.get(edge.from);
      const to = this.nodeMap.get(edge.to);
      if (!from || !to) return;
      const pathString = this.buildEdgePath(from, to);
      const path = this.createSvgElement("path", {
        d: pathString,
        class: `edge ${edge.type}`,
        "data-from": edge.from,
        "data-to": edge.to,
        "data-id": edge.id,
      });
      const label = this.createSvgElement("text", {
        x: (from.x + to.x + this.nodeWidth) / 2,
        y: (from.y + to.y + this.nodeHeight) / 2,
        class: "edge-label",
      });
      label.textContent = edge.label;
      edgeLayer.append(path, label);
      this.edgeElements.set(edge.id, path);
    });

    this.nodes.forEach((node) => {
      const group = this.createSvgElement("g", {
        class: `node type-${node.type}`,
        transform: `translate(${node.x}, ${node.y})`,
        "data-id": node.id,
        tabindex: 0,
        role: "button",
      });
      const rect = this.createSvgElement("rect", {
        width: this.nodeWidth,
        height: this.nodeHeight,
      });
      const title = this.createSvgElement("text", { x: 14, y: 29 });
      title.textContent = node.label;
      const subtitle = this.createSvgElement("text", {
        x: 14,
        y: 53,
        class: "node-sub",
      });
      subtitle.textContent = `${node.blueprint} · ${node.subtitle}`;
      group.append(rect, title, subtitle);

      group.addEventListener("click", () => this.selectNode(node.id, true));
      group.addEventListener("mouseenter", () => this.highlightPath(node.id));
      group.addEventListener("mouseleave", () => this.resetHoverState());
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.selectNode(node.id, true);
        }
      });

      nodeLayer.append(group);
      this.nodeElements.set(node.id, group);
    });

    this.group.append(sectionLayer, edgeLayer, nodeLayer);

    this.svg.setAttribute("viewBox", "0 0 1360 2860");
    this.svg.style.height = "2860px";
    this.applyTransform();
  }

  bindEvents() {
    this.searchInput.addEventListener("input", () => this.search(this.searchInput.value));
    this.searchNextButton.addEventListener("click", () => this.jumpToNextSearchResult());
    this.resetHighlightsButton.addEventListener("click", () => {
      this.searchInput.value = "";
      this.search("");
      this.resetHoverState(true);
    });

    document.getElementById("zoomIn").addEventListener("click", () => this.zoomBy(0.14));
    document.getElementById("zoomOut").addEventListener("click", () => this.zoomBy(-0.14));
    document.getElementById("fitToScreen").addEventListener("click", () => this.fitToWidth());
    document.getElementById("resetZoom").addEventListener("click", () => this.resetZoom());
    document.getElementById("downloadImage").addEventListener("click", () => this.downloadAsImage());
    document.getElementById("shareNode").addEventListener("click", () => this.shareLink());
    document.getElementById("printView").addEventListener("click", () => window.print());

    document.getElementById("backToTree").addEventListener("click", () => {
      this.viewport.scrollIntoView({ behavior: "smooth", block: "start" });
      if (this.selectedNodeId) this.jumpToNode(this.selectedNodeId);
    });

    document.getElementById("collapsePanel").addEventListener("click", (event) => {
      this.detailPanel.classList.toggle("collapsed");
      const expanded = !this.detailPanel.classList.contains("collapsed");
      event.currentTarget.setAttribute("aria-expanded", String(expanded));
      event.currentTarget.textContent = expanded ? "Collapse" : "Expand";
    });

    document.getElementById("toggleSidebarMobile").addEventListener("click", () => {
      this.detailPanel.classList.add("mobile-open");
    });

    document.getElementById("closeSidebarMobile").addEventListener("click", () => {
      this.detailPanel.classList.remove("mobile-open");
    });

    this.viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      this.zoomBy(delta, event.clientX, event.clientY);
    }, { passive: false });

    this.viewport.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.lastPoint = { x: event.clientX, y: event.clientY };
      this.viewport.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastPoint.x;
      const dy = event.clientY - this.lastPoint.y;
      this.lastPoint = { x: event.clientX, y: event.clientY };
      this.panX += dx;
      this.panY += dy;
      this.applyTransform();
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
      this.viewport.style.cursor = "default";
    });

    window.addEventListener("hashchange", () => this.restoreFromHash());
  }

  createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  buildEdgePath(from, to) {
    const startX = from.x + this.nodeWidth / 2;
    const startY = from.y + this.nodeHeight;
    const endX = to.x + this.nodeWidth / 2;
    const endY = to.y;

    if (Math.abs(startX - endX) < 6) {
      return `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    const midY = (startY + endY) / 2;
    return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
  }

  selectNode(nodeId, updateHash = false) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    this.selectedNodeId = nodeId;
    this.showNodeDetail(nodeId);

    this.nodeElements.forEach((element, id) => {
      element.classList.toggle("active", id === nodeId);
    });

    this.highlightPath(nodeId);
    this.detailPanel.classList.remove("collapsed");

    if (window.innerWidth <= 980) {
      this.detailPanel.classList.add("mobile-open");
    }

    if (updateHash) {
      history.replaceState(null, "", `#${nodeId}`);
    }
  }

  showNodeDetail(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    const details = node.details;
    const variablesMarkup = details.variables.map((item) => `<li>${this.escapeHtml(item)}</li>`).join("");
    const params = details.parameters.length ? details.parameters.join(", ") : "None";

    const relatedMarkup = details.related
      .map((link) => {
        const relatedNode = this.nodeMap.get(link.id);
        if (!relatedNode) return "";
        const arrow = link.direction === "incoming" ? "←" : link.direction === "outgoing" ? "→" : "⟷";
        return `<li>${arrow} <button type=\"button\" data-related-id=\"${relatedNode.id}\">${this.escapeHtml(relatedNode.label)}</button></li>`;
      })
      .join("");

    const logicMarkup = details.keyLogic.map((item) => `<li>${this.escapeHtml(item)}</li>`).join("");

    this.detailContent.innerHTML = `
      <article class="detail-block">
        <h3>${this.escapeHtml(node.label)}</h3>
        <dl class="meta-grid">
          <dt>Blueprint</dt><dd>${this.escapeHtml(node.blueprint)}</dd>
          <dt>Network Role</dt><dd>${this.escapeHtml(node.networkRole)}</dd>
        </dl>
      </article>

      <article class="detail-block">
        <h3>📌 FUNCTION / EVENT</h3>
        <dl class="meta-grid">
          <dt>Event Name</dt><dd>${this.escapeHtml(details.functionName)}</dd>
          <dt>Scope</dt><dd>${this.escapeHtml(details.scope)}</dd>
          <dt>Reliable</dt><dd>${this.escapeHtml(details.reliable)}</dd>
          <dt>Parameters</dt><dd>${this.escapeHtml(params)}</dd>
        </dl>
      </article>

      <article class="detail-block">
        <h3>📊 VARIABLES INVOLVED</h3>
        <ul class="list">${variablesMarkup}</ul>
      </article>

      <article class="detail-block">
        <h3>💻 BLUEPRINT CODE</h3>
        <pre class="code">${this.escapeHtml(details.codeSnippet)}</pre>
      </article>

      <article class="detail-block">
        <h3>🔗 RELATED NODES</h3>
        <ul class="links">${relatedMarkup}</ul>
      </article>

      <article class="detail-block">
        <h3>⚡ KEY LOGIC</h3>
        <ul class="list">${logicMarkup}</ul>
      </article>
    `;

    this.detailContent.querySelectorAll("[data-related-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const relatedId = button.getAttribute("data-related-id");
        this.jumpToNode(relatedId);
        this.selectNode(relatedId, true);
      });
    });
  }

  highlightPath(nodeId) {
    const connectedEdges = this.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    const relatedNodeIds = new Set([nodeId]);
    connectedEdges.forEach((edge) => {
      relatedNodeIds.add(edge.from);
      relatedNodeIds.add(edge.to);
      const edgeElement = this.edgeElements.get(edge.id);
      if (edgeElement) edgeElement.classList.add("highlight");
    });

    this.nodeElements.forEach((element, id) => {
      const isRelated = relatedNodeIds.has(id);
      element.classList.toggle("hovered", isRelated);
      element.classList.toggle("faded", !isRelated);
    });

    this.edgeElements.forEach((element, id) => {
      const edge = this.edges.find((item) => item.id === id);
      const isRelated = edge && (edge.from === nodeId || edge.to === nodeId);
      element.classList.toggle("faded", !isRelated);
    });
  }

  resetHoverState(keepActive = false) {
    this.nodeElements.forEach((element) => {
      element.classList.remove("hovered", "faded");
    });
    this.edgeElements.forEach((element) => {
      element.classList.remove("highlight", "faded");
    });

    if (keepActive && this.selectedNodeId) {
      this.highlightPath(this.selectedNodeId);
    }
  }

  search(query) {
    const normalized = query.trim().toLowerCase();
    this.searchResults = [];
    this.searchIndex = 0;

    this.nodeElements.forEach((element) => element.classList.remove("search-match"));

    if (!normalized) return;

    this.nodes.forEach((node) => {
      const searchableText = [
        node.label,
        node.subtitle,
        node.blueprint,
        node.details.functionName,
        node.details.parameters.join(" "),
        node.details.variables.join(" "),
        node.details.codeSnippet,
        node.details.keyLogic.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      if (searchableText.includes(normalized)) {
        this.searchResults.push(node.id);
        const nodeElement = this.nodeElements.get(node.id);
        if (nodeElement) nodeElement.classList.add("search-match");
      }
    });

    if (this.searchResults.length > 0) {
      this.jumpToNode(this.searchResults[0]);
      this.selectNode(this.searchResults[0], true);
    }
  }

  jumpToNextSearchResult() {
    if (this.searchResults.length === 0) return;
    this.searchIndex = (this.searchIndex + 1) % this.searchResults.length;
    const nodeId = this.searchResults[this.searchIndex];
    this.jumpToNode(nodeId);
    this.selectNode(nodeId, true);
  }

  jumpToNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    const targetX = node.x + this.nodeWidth / 2;
    const targetY = node.y + this.nodeHeight / 2;

    const viewportRect = this.viewport.getBoundingClientRect();
    const centerX = viewportRect.width / 2;
    const centerY = viewportRect.height / 2;

    this.panX = centerX - targetX * this.scale;
    this.panY = centerY - targetY * this.scale;
    this.applyTransform();
  }

  zoomBy(delta, clientX, clientY) {
    const oldScale = this.scale;
    const nextScale = Math.min(this.maxScale, Math.max(this.minScale, oldScale + delta));
    if (nextScale === oldScale) return;

    const viewportRect = this.viewport.getBoundingClientRect();
    const px = (clientX ?? viewportRect.left + viewportRect.width / 2) - viewportRect.left;
    const py = (clientY ?? viewportRect.top + viewportRect.height / 2) - viewportRect.top;

    const worldX = (px - this.panX) / oldScale;
    const worldY = (py - this.panY) / oldScale;

    this.scale = nextScale;
    this.panX = px - worldX * nextScale;
    this.panY = py - worldY * nextScale;
    this.applyTransform();
  }

  resetZoom() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  fitToWidth() {
    const viewportRect = this.viewport.getBoundingClientRect();
    const contentWidth = 1360;
    const padding = 30;
    this.scale = Math.min(1.05, Math.max(this.minScale, (viewportRect.width - padding * 2) / contentWidth));
    this.panX = padding;
    this.panY = 12;
    this.applyTransform();
  }

  applyTransform() {
    this.group.setAttribute("transform", `translate(${this.panX} ${this.panY}) scale(${this.scale})`);
  }

  restoreFromHash() {
    const hash = window.location.hash.replace("#", "").trim();
    if (!hash) return;
    if (this.nodeMap.has(hash)) {
      this.jumpToNode(hash);
      this.selectNode(hash, false);
    }
  }

  shareLink() {
    const selected = this.selectedNodeId || "";
    const url = new URL(window.location.href);
    url.hash = selected;
    const link = url.toString();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link);
    } else {
      window.prompt("Copy this link:", link);
    }
  }

  downloadAsImage() {
    const serializer = new XMLSerializer();
    const svgClone = this.svg.cloneNode(true);
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
      .section-band{fill:rgba(59,130,246,.045);stroke:rgba(120,145,197,.3)}
      .section-title{fill:#d0defe;font:680 20px Inter,sans-serif}
      .node rect{fill:#121928;stroke-width:2;rx:10}
      .node text{fill:#e5ebf7;font:12.5px Inter,sans-serif}
      .node .node-sub{fill:#9aa7c2;font:11px Inter,sans-serif}
      .node.type-event rect{stroke:#a855f7}.node.type-function rect{stroke:#3b82f6}
      .node.type-check rect{stroke:#9ca3af}.node.type-rpc rect{stroke:#f97316}
      .node.type-decision rect{stroke:#22c55e}.node.type-revert rect{stroke:#ef4444}
      .edge{fill:none;stroke-width:2.8;opacity:.88}.edge.replication{stroke:#3b82f6}
      .edge.rpc{stroke:#f97316;stroke-dasharray:9 5}.edge.revert{stroke:#ef4444;stroke-dasharray:7 5}
      .edge.local{stroke:#9ca3af}.edge.server{stroke:#22c55e}
      .edge-label{fill:#cad6f5;font:11px Inter,sans-serif}
    `;
    svgClone.insertBefore(style, svgClone.firstChild);
    const svgString = serializer.serializeToString(svgClone);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1360;
      canvas.height = 2860;
      const context = canvas.getContext("2d");
      context.fillStyle = "#090b10";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);

      const png = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "master-task-workflow-tree.png";
      link.href = png;
      link.click();
    };
    image.src = url;
  }

  escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.masterTree = new MasterTree();
});
