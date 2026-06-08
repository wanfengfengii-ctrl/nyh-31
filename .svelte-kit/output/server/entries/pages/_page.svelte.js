import { c as create_ssr_component, b as createEventDispatcher, o as onDestroy, d as add_attribute, f as each, e as escape, h as get_store_value, s as subscribe, v as validate_component } from "../../chunks/ssr.js";
import "cytoscape";
import { d as derived, w as writable } from "../../chunks/index.js";
function calculateShortestPath(nodes2, edges2, sourceId, targetId) {
  const nodeMap = /* @__PURE__ */ new Map();
  nodes2.forEach((n) => nodeMap.set(n.id, n));
  const adjacency = /* @__PURE__ */ new Map();
  nodes2.forEach((n) => adjacency.set(n.id, []));
  edges2.forEach((edge) => {
    if (!edge.enabled) return;
    if (edge.isSwitch && !edge.switchActive) return;
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) return;
    if (sourceNode.blocked || targetNode.blocked) return;
    adjacency.get(edge.source)?.push({
      nodeId: edge.target,
      edgeId: edge.id,
      length: edge.length
    });
    adjacency.get(edge.target)?.push({
      nodeId: edge.source,
      edgeId: edge.id,
      length: edge.length
    });
  });
  const distances = /* @__PURE__ */ new Map();
  const previous = /* @__PURE__ */ new Map();
  const visited = /* @__PURE__ */ new Set();
  nodes2.forEach((n) => {
    distances.set(n.id, Infinity);
    previous.set(n.id, null);
  });
  distances.set(sourceId, 0);
  while (visited.size < nodes2.length) {
    let minDist = Infinity;
    let currentNode = "";
    nodes2.forEach((n) => {
      if (!visited.has(n.id) && (distances.get(n.id) ?? Infinity) < minDist) {
        minDist = distances.get(n.id) ?? Infinity;
        currentNode = n.id;
      }
    });
    if (minDist === Infinity || currentNode === "") break;
    visited.add(currentNode);
    const neighbors = adjacency.get(currentNode) || [];
    neighbors.forEach((neighbor) => {
      if (visited.has(neighbor.nodeId)) return;
      const newDist = (distances.get(currentNode) ?? Infinity) + neighbor.length;
      if (newDist < (distances.get(neighbor.nodeId) ?? Infinity)) {
        distances.set(neighbor.nodeId, newDist);
        previous.set(neighbor.nodeId, { nodeId: currentNode, edgeId: neighbor.edgeId });
      }
    });
  }
  const blockedNodes = nodes2.filter((n) => n.blocked).map((n) => n.id);
  if (!distances.has(targetId) || distances.get(targetId) === Infinity) {
    const brokenNodes = findBrokenNodes(nodes2, edges2, sourceId);
    return {
      nodes: [],
      edges: [],
      totalDistance: 0,
      switchCount: 0,
      blockedNodes,
      brokenNodes,
      hasPath: false
    };
  }
  const pathNodes = [];
  const pathEdges = [];
  let current = targetId;
  while (current !== sourceId) {
    pathNodes.unshift(current);
    const prev = previous.get(current);
    if (!prev) break;
    pathEdges.unshift(prev.edgeId);
    current = prev.nodeId;
  }
  pathNodes.unshift(sourceId);
  let switchCount = 0;
  pathEdges.forEach((edgeId) => {
    const edge = edges2.find((e) => e.id === edgeId);
    if (edge?.isSwitch) switchCount++;
  });
  return {
    nodes: pathNodes,
    edges: pathEdges,
    totalDistance: distances.get(targetId) ?? 0,
    switchCount,
    blockedNodes,
    brokenNodes: [],
    hasPath: true
  };
}
function findBrokenNodes(nodes2, edges2, sourceId, targetId) {
  const nodeMap = /* @__PURE__ */ new Map();
  nodes2.forEach((n) => nodeMap.set(n.id, n));
  const adjacency = /* @__PURE__ */ new Map();
  nodes2.forEach((n) => adjacency.set(n.id, []));
  edges2.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) return;
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  });
  const reachableFromSource = /* @__PURE__ */ new Set();
  const queue = [sourceId];
  reachableFromSource.add(sourceId);
  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = adjacency.get(current) || [];
    neighbors.forEach((n) => {
      if (!reachableFromSource.has(n)) {
        const node = nodeMap.get(n);
        const edge = edges2.find(
          (e) => e.source === current && e.target === n || e.target === current && e.source === n
        );
        const isPassable = node && !node.blocked && edge && edge.enabled && (!edge.isSwitch || edge.switchActive);
        if (isPassable) {
          reachableFromSource.add(n);
          queue.push(n);
        }
      }
    });
  }
  const brokenNodes = [];
  reachableFromSource.forEach((nodeId) => {
    const neighbors = adjacency.get(nodeId) || [];
    neighbors.forEach((neighborId) => {
      if (!reachableFromSource.has(neighborId)) {
        if (!brokenNodes.includes(nodeId)) {
          brokenNodes.push(nodeId);
        }
      }
    });
  });
  return brokenNodes;
}
const initialNodes = [
  { id: "n1", label: "1", type: "loading", x: 100, y: 200, blocked: false },
  { id: "n2", label: "2", type: "normal", x: 300, y: 200, blocked: false },
  { id: "n3", label: "3", type: "switch", x: 500, y: 200, blocked: false },
  { id: "n4", label: "4", type: "normal", x: 700, y: 100, blocked: false },
  { id: "n5", label: "5", type: "normal", x: 700, y: 300, blocked: false },
  { id: "n6", label: "6", type: "unloading", x: 900, y: 200, blocked: false }
];
const initialEdges = [
  { id: "e1", source: "n1", target: "n2", length: 50, enabled: true, isSwitch: false, switchActive: false },
  { id: "e2", source: "n2", target: "n3", length: 80, enabled: true, isSwitch: false, switchActive: false },
  { id: "e3", source: "n3", target: "n4", length: 60, enabled: true, isSwitch: true, switchActive: true },
  { id: "e4", source: "n3", target: "n5", length: 70, enabled: true, isSwitch: true, switchActive: false },
  { id: "e5", source: "n4", target: "n6", length: 90, enabled: true, isSwitch: false, switchActive: false },
  { id: "e6", source: "n5", target: "n6", length: 55, enabled: true, isSwitch: false, switchActive: false }
];
const nodes = writable(initialNodes);
const edges = writable(initialEdges);
const selectedNodeId = writable(null);
const selectedEdgeId = writable(null);
const loadingNodeId = writable("n1");
const unloadingNodeId = writable("n6");
const schemes = writable([]);
const currentSchemeName = writable("默认方案");
const pathResult = derived(
  [nodes, edges, loadingNodeId, unloadingNodeId],
  ([$nodes, $edges, $loadingId, $unloadingId]) => {
    if (!$loadingId || !$unloadingId) {
      return {
        nodes: [],
        edges: [],
        totalDistance: 0,
        switchCount: 0,
        blockedNodes: [],
        brokenNodes: [],
        hasPath: false
      };
    }
    return calculateShortestPath($nodes, $edges, $loadingId, $unloadingId);
  }
);
const CytoscapeGraph = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { addMode = null } = $$props;
  createEventDispatcher();
  let cyContainer;
  let cy = null;
  onDestroy(() => {
    if (cy) cy.destroy();
    cy = null;
  });
  if ($$props.addMode === void 0 && $$bindings.addMode && addMode !== void 0) $$bindings.addMode(addMode);
  return `<div id="cy-container" class="w-full min-h-[500px] h-full bg-surface-50 rounded-lg"${add_attribute("this", cyContainer, 0)}></div>`;
});
const ToolPanel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { addMode = null } = $$props;
  function getButtonClass(mode) {
    const base = "btn btn-sm ";
    if (addMode !== mode) return base + "variant-soft";
    switch (mode) {
      case "normal":
      case "unloading":
        return base + "variant-filled-primary";
      case "loading":
        return base + "variant-filled-success";
      case "switch":
        return base + "variant-filled-warning";
      case "edge":
        return base + "variant-filled-surface";
      default:
        return base + "variant-soft";
    }
  }
  const tools = [
    {
      mode: "normal",
      label: "普通节点",
      icon: "●"
    },
    {
      mode: "loading",
      label: "装载点",
      icon: "⬆"
    },
    {
      mode: "unloading",
      label: "卸载点",
      icon: "⬇"
    },
    {
      mode: "switch",
      label: "岔道节点",
      icon: "◈"
    },
    {
      mode: "edge",
      label: "轨道边",
      icon: "━"
    }
  ];
  if ($$props.addMode === void 0 && $$bindings.addMode && addMode !== void 0) $$bindings.addMode(addMode);
  return `<div class="card p-4 space-y-3"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-5kytu1">绘图工具</h3> <div class="grid grid-cols-2 gap-2">${each(tools, (tool) => {
    return `<button${add_attribute("class", getButtonClass(tool.mode), 0)}><span class="mr-1">${escape(tool.icon)}</span> ${escape(tool.label)} </button>`;
  })}</div> <button class="btn btn-sm variant-ghost-danger w-full" data-svelte-h="svelte-139ej6s">取消选择</button> <p class="text-xs text-tertiary-500 mt-2">${addMode === "edge" ? `点击两个节点来创建轨道边` : `${addMode ? `点击画布添加${escape(tools.find((t) => t.mode === addMode)?.label)}` : `选择工具开始绘制`}`}</p></div>`;
});
const NodePanel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $selectedNode, $$unsubscribe_selectedNode;
  const selectedNode = derived(selectedNodeId, ($id) => {
    const $nodes = get_store_value(nodes);
    return $nodes.find((n) => n.id === $id) || null;
  });
  $$unsubscribe_selectedNode = subscribe(selectedNode, (value) => $selectedNode = value);
  let editLabel = "";
  let editBlocked = false;
  let labelError = "";
  const typeOptions = [
    {
      value: "normal",
      label: "普通节点"
    },
    {
      value: "loading",
      label: "装载点"
    },
    {
      value: "unloading",
      label: "卸载点"
    },
    {
      value: "switch",
      label: "岔道节点"
    }
  ];
  {
    if ($selectedNode) {
      editLabel = $selectedNode.label;
      $selectedNode.type;
      editBlocked = $selectedNode.blocked;
      labelError = "";
    }
  }
  $$unsubscribe_selectedNode();
  return `<div class="card p-4 space-y-3"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-n216zh">节点属性</h3> ${$selectedNode ? `<div class="space-y-3"><div><label for="nodeLabel" class="label" data-svelte-h="svelte-1ycvqw1">节点编号</label> <input id="nodeLabel" type="text" class="${"input " + escape(labelError ? "input-error" : "", true)}"${add_attribute("value", editLabel, 0)}> ${labelError ? `<p class="text-xs text-error-500 mt-1">${escape(labelError)}</p>` : ``}</div> <div><label for="nodeType" class="label" data-svelte-h="svelte-j2i8fs">节点类型</label> <select id="nodeType" class="select">${each(typeOptions, (opt) => {
    return `<option${add_attribute("value", opt.value, 0)}>${escape(opt.label)}</option>`;
  })}</select></div> <div class="flex items-center gap-2"><input type="checkbox" class="checkbox" id="blocked"${add_attribute("checked", editBlocked, 1)}> <label for="blocked" class="label cursor-pointer" data-svelte-h="svelte-bq0caf">标记为堵塞</label></div> <div class="flex gap-2"><button class="btn btn-sm variant-filled-primary flex-1" data-svelte-h="svelte-m54e40">保存</button> <button class="btn btn-sm variant-filled-error" data-svelte-h="svelte-1qrkhzv">删除</button></div></div>` : `<p class="text-sm text-tertiary-500" data-svelte-h="svelte-1o2dqk4">点击选择一个节点进行编辑</p>`}</div>`;
});
const EdgePanel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $selectedEdge, $$unsubscribe_selectedEdge;
  const selectedEdge = derived(selectedEdgeId, ($id) => {
    const $edges = get_store_value(edges);
    const $nodes = get_store_value(nodes);
    const edge = $edges.find((e) => e.id === $id);
    if (!edge) return null;
    const source = $nodes.find((n) => n.id === edge.source);
    const target = $nodes.find((n) => n.id === edge.target);
    return {
      edge,
      sourceLabel: source?.label || "?",
      targetLabel: target?.label || "?"
    };
  });
  $$unsubscribe_selectedEdge = subscribe(selectedEdge, (value) => $selectedEdge = value);
  let editLength = 50;
  let lengthError = "";
  {
    if ($selectedEdge) {
      editLength = $selectedEdge.edge.length;
      lengthError = "";
    }
  }
  $$unsubscribe_selectedEdge();
  return `<div class="card p-4 space-y-3"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-1je7gnx">轨道属性</h3> ${$selectedEdge ? `<div class="space-y-3"><p class="text-sm text-tertiary-600">节点 ${escape($selectedEdge.sourceLabel)} → ${escape($selectedEdge.targetLabel)}</p> <div><label for="edgeLength" class="label" data-svelte-h="svelte-xph6qm">轨道长度</label> <input id="edgeLength" type="number" class="${"input " + escape(lengthError ? "input-error" : "", true)}" min="1"${add_attribute("value", editLength, 0)}> ${lengthError ? `<p class="text-xs text-error-500 mt-1">${escape(lengthError)}</p>` : ``}</div> <div class="flex items-center gap-2"><input type="checkbox" class="checkbox" id="edgeEnabled" ${$selectedEdge.edge.enabled ? "checked" : ""}> <label for="edgeEnabled" class="label cursor-pointer" data-svelte-h="svelte-t454nr">启用轨道</label></div> <div class="flex items-center gap-2"><input type="checkbox" class="checkbox" id="isSwitch" ${$selectedEdge.edge.isSwitch ? "checked" : ""}> <label for="isSwitch" class="label cursor-pointer" data-svelte-h="svelte-b6b9w">是岔道开关</label></div> ${$selectedEdge.edge.isSwitch ? `<div class="p-2 bg-warning-50 rounded"><div class="flex items-center justify-between"><span class="text-sm" data-svelte-h="svelte-6ao855">岔道状态:</span> <span class="${[
    "font-medium",
    ($selectedEdge.edge.switchActive ? "text-warning-700" : "") + " " + (!$selectedEdge.edge.switchActive ? "text-gray-500" : "")
  ].join(" ").trim()}">${escape($selectedEdge.edge.switchActive ? "开启" : "关闭")}</span></div> <button class="btn btn-sm variant-filled-warning w-full mt-2" ${!$selectedEdge.edge.enabled ? "disabled" : ""}>切换岔道状态</button></div>` : ``} <div class="flex gap-2"><button class="btn btn-sm variant-filled-primary flex-1" data-svelte-h="svelte-m54e40">保存</button> <button class="btn btn-sm variant-filled-error" data-svelte-h="svelte-1qrkhzv">删除</button></div></div>` : `<p class="text-sm text-tertiary-500" data-svelte-h="svelte-10yuy6j">点击选择一条轨道进行编辑</p>`}</div>`;
});
const PathPanel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $loadingNode, $$unsubscribe_loadingNode;
  let $unloadingNode, $$unsubscribe_unloadingNode;
  let $pathResult, $$unsubscribe_pathResult;
  $$unsubscribe_pathResult = subscribe(pathResult, (value) => $pathResult = value);
  const loadingNode = derived(loadingNodeId, ($id) => {
    const $nodes = get_store_value(nodes);
    return $nodes.find((n) => n.id === $id);
  });
  $$unsubscribe_loadingNode = subscribe(loadingNode, (value) => $loadingNode = value);
  const unloadingNode = derived(unloadingNodeId, ($id) => {
    const $nodes = get_store_value(nodes);
    return $nodes.find((n) => n.id === $id);
  });
  $$unsubscribe_unloadingNode = subscribe(unloadingNode, (value) => $unloadingNode = value);
  function getNodeLabel(nodeId) {
    const node = get_store_value(nodes).find((n) => n.id === nodeId);
    return node?.label || nodeId;
  }
  $$unsubscribe_loadingNode();
  $$unsubscribe_unloadingNode();
  $$unsubscribe_pathResult();
  return `<div class="card p-4 space-y-3"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-qoiky">路径信息</h3> <div class="text-sm space-y-1"><div class="flex justify-between"><span class="text-tertiary-600" data-svelte-h="svelte-1mg0z9f">装载点:</span> <span class="font-medium text-green-600">${escape($loadingNode?.label || "未设置")}</span></div> <div class="flex justify-between"><span class="text-tertiary-600" data-svelte-h="svelte-w7xi1q">卸载点:</span> <span class="font-medium text-blue-600">${escape($unloadingNode?.label || "未设置")}</span></div></div> <hr class="my-2"> ${$pathResult.hasPath ? `<div class="space-y-2"><div class="bg-success-50 p-3 rounded-lg" data-svelte-h="svelte-18wcaqo"><p class="text-success-700 font-medium text-sm">✓ 找到可行路线</p></div> <div class="text-sm space-y-1"><div class="flex justify-between"><span class="text-tertiary-600" data-svelte-h="svelte-l2732b">总距离:</span> <span class="font-bold">${escape($pathResult.totalDistance)}</span></div> <div class="flex justify-between"><span class="text-tertiary-600" data-svelte-h="svelte-nt1q9v">经过岔道数:</span> <span class="font-bold text-amber-600">${escape($pathResult.switchCount)}</span></div> <div class="flex justify-between"><span class="text-tertiary-600" data-svelte-h="svelte-2mg153">经过节点数:</span> <span class="font-bold">${escape($pathResult.nodes.length)}</span></div></div> <div><p class="text-sm text-tertiary-600 mb-1" data-svelte-h="svelte-1rrjh6f">路径节点:</p> <div class="flex flex-wrap gap-1">${each($pathResult.nodes, (nodeId, index) => {
    return `<span class="px-2 py-1 bg-surface-200 rounded text-xs">${escape(getNodeLabel(nodeId))}</span> ${index < $pathResult.nodes.length - 1 ? `<span class="text-tertiary-400" data-svelte-h="svelte-1ghr14e">→</span>` : ``}`;
  })}</div></div></div>` : `<div class="space-y-2"><div class="bg-error-50 p-3 rounded-lg" data-svelte-h="svelte-1wx7um4"><p class="text-error-700 font-medium text-sm">✗ 无可行路线</p></div> ${$pathResult.brokenNodes.length > 0 ? `<div><p class="text-sm text-tertiary-600 mb-1" data-svelte-h="svelte-ql28f2">断点节点:</p> <div class="flex flex-wrap gap-1">${each($pathResult.brokenNodes, (nodeId) => {
    return `<span class="px-2 py-1 bg-error-100 text-error-700 rounded text-xs">${escape(getNodeLabel(nodeId))} </span>`;
  })}</div></div>` : ``}</div>`} ${$pathResult.blockedNodes.length > 0 ? `<hr class="my-2"> <div><p class="text-sm text-tertiary-600 mb-1" data-svelte-h="svelte-py7zzr">堵塞节点:</p> <div class="flex flex-wrap gap-1">${each($pathResult.blockedNodes, (nodeId) => {
    return `<span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">${escape(getNodeLabel(nodeId))} </span>`;
  })}</div></div>` : ``}</div>`;
});
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
const SchemePanel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $currentSchemeName, $$unsubscribe_currentSchemeName;
  let $schemesSorted, $$unsubscribe_schemesSorted;
  $$unsubscribe_currentSchemeName = subscribe(currentSchemeName, (value) => $currentSchemeName = value);
  const schemesSorted = derived(schemes, ($schemes) => {
    return [...$schemes].sort((a, b) => b.updatedAt - a.updatedAt);
  });
  $$unsubscribe_schemesSorted = subscribe(schemesSorted, (value) => $schemesSorted = value);
  $$unsubscribe_currentSchemeName();
  $$unsubscribe_schemesSorted();
  return `<div class="card p-4 space-y-3"><div class="flex items-center justify-between"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-7zlmst">方案管理</h3> <button class="btn btn-sm variant-filled-primary">${escape("保存方案")}</button></div> <div><p class="text-sm text-tertiary-600">当前方案: <span class="font-medium text-primary-700">${escape($currentSchemeName)}</span></p></div> ${``} <hr class="my-2"> <div class="space-y-2 max-h-60 overflow-y-auto">${$schemesSorted.length === 0 ? `<p class="text-sm text-tertiary-500 text-center py-4" data-svelte-h="svelte-zktfcy">暂无保存的方案</p>` : `${each($schemesSorted, (scheme) => {
    return `<div class="${[
      "p-2 rounded border border-surface-300 hover:bg-surface-50 transition-colors",
      (scheme.name === $currentSchemeName ? "border-primary-400" : "") + " " + (scheme.name === $currentSchemeName ? "bg-primary-50" : "")
    ].join(" ").trim()}"><div class="flex items-center justify-between"><span class="font-medium text-sm">${escape(scheme.name)}</span> <span class="text-xs text-tertiary-500">${escape(formatDate(scheme.updatedAt))}</span></div> <div class="text-xs text-tertiary-500 mt-1">${escape(scheme.nodes.length)} 个节点 · ${escape(scheme.edges.length)} 条轨道</div> <div class="flex gap-1 mt-2"><button class="btn btn-xs variant-soft-primary flex-1" data-svelte-h="svelte-el0cs">加载</button> <button class="btn btn-xs variant-soft-error" data-svelte-h="svelte-11cav73">删除
						</button></div> </div>`;
  })}`}</div></div>`;
});
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let addMode = null;
  let $$settled;
  let $$rendered;
  let previous_head = $$result.head;
  do {
    $$settled = true;
    $$result.head = previous_head;
    $$rendered = `<div class="min-h-screen bg-surface-200 flex flex-col"><header class="bg-surface-900 text-surface-50 px-6 py-4 shadow-lg flex-shrink-0" data-svelte-h="svelte-13coe9e"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-primary-400">⛏ 老矿洞轨道模拟系统</h1> <p class="text-sm text-surface-400">绘制矿洞轨道 · 计算运输路线 · 分析堵塞风险</p></div> <div class="text-sm text-surface-400 text-right"><p>节点编号不能重复</p> <p>轨道长度必须大于 0</p></div></div></header> <div class="flex flex-1 overflow-hidden"><aside class="w-72 bg-surface-100 border-r border-surface-300 p-4 space-y-4 overflow-y-auto flex-shrink-0">${validate_component(ToolPanel, "ToolPanel").$$render(
      $$result,
      { addMode },
      {
        addMode: ($$value) => {
          addMode = $$value;
          $$settled = false;
        }
      },
      {}
    )} ${validate_component(NodePanel, "NodePanel").$$render($$result, {}, {}, {})} ${validate_component(EdgePanel, "EdgePanel").$$render($$result, {}, {}, {})}</aside> <main class="flex-1 p-4 min-w-0"><div class="w-full h-full bg-white rounded-xl shadow-md overflow-hidden">${validate_component(CytoscapeGraph, "CytoscapeGraph").$$render($$result, { addMode }, {}, {})}</div></main> <aside class="w-80 bg-surface-100 border-l border-surface-300 p-4 space-y-4 overflow-y-auto flex-shrink-0">${validate_component(PathPanel, "PathPanel").$$render($$result, {}, {}, {})} ${validate_component(SchemePanel, "SchemePanel").$$render($$result, {}, {}, {})} <div class="card p-4 space-y-2" data-svelte-h="svelte-1j95tht"><h3 class="text-lg font-bold text-primary-900">图例说明</h3> <div class="space-y-2 text-sm"><div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-green-500 border-2 border-gray-800"></div> <span>装载点</span></div> <div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-blue-500 border-2 border-gray-800"></div> <span>卸载点</span></div> <div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-amber-500 border-2 border-gray-800"></div> <span>岔道节点</span></div> <div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-gray-500 border-2 border-gray-800"></div> <span>普通节点</span></div> <div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-red-500 border-2 border-gray-800"></div> <span>堵塞节点</span></div> <hr class="my-2"> <div class="flex items-center gap-2"><div class="w-8 h-1 bg-gray-700"></div> <span>普通轨道</span></div> <div class="flex items-center gap-2"><div class="w-8 h-1 bg-amber-500"></div> <span>岔道（开启）</span></div> <div class="flex items-center gap-2"><div class="w-8 h-0.5 bg-gray-300 border-t border-dashed"></div> <span>关闭轨道</span></div> <div class="flex items-center gap-2"><div class="w-8 h-1 bg-green-500"></div> <span>最短路径</span></div></div></div></aside></div></div>`;
  } while (!$$settled);
  return $$rendered;
});
export {
  Page as default
};
