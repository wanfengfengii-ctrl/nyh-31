import { c as create_ssr_component, b as createEventDispatcher, o as onDestroy, d as add_attribute, f as each, e as escape, s as subscribe, h as get_store_value, v as validate_component } from "../../chunks/ssr.js";
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
function createConflictId() {
  return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function getEdgeById(edges2, edgeId) {
  return edges2.find((e) => e.id === edgeId);
}
function getNodeById(nodes2, nodeId) {
  return nodes2.find((n) => n.id === nodeId);
}
function calculateTravelTime(length, speed) {
  if (speed <= 0) return Infinity;
  return length / speed;
}
function buildTimedRoute(nodes2, edges2, cart) {
  const pathResult2 = calculateShortestPath(nodes2, edges2, cart.sourceId, cart.targetId);
  if (!pathResult2.hasPath) {
    return {
      cartId: cart.id,
      cartName: cart.name,
      positions: [],
      totalDistance: 0,
      totalTime: 0,
      switchCount: 0,
      hasPath: false,
      waitTime: 0
    };
  }
  const positions = [];
  let currentTime = cart.departureTime;
  const sourceNode = getNodeById(nodes2, cart.sourceId);
  if (sourceNode) {
    positions.push({
      nodeId: cart.sourceId,
      edgeId: null,
      arrivalTime: currentTime,
      departureTime: currentTime,
      isSwitch: sourceNode.type === "switch"
    });
  }
  for (let i = 0; i < pathResult2.edges.length; i++) {
    const edgeId = pathResult2.edges[i];
    const edge = getEdgeById(edges2, edgeId);
    const nextNodeId = pathResult2.nodes[i + 1];
    const nextNode = getNodeById(nodes2, nextNodeId);
    if (edge && nextNode) {
      const travelTime = calculateTravelTime(edge.length, cart.speed);
      const arrivalTime = currentTime + travelTime;
      positions.push({
        nodeId: nextNodeId,
        edgeId,
        arrivalTime,
        departureTime: arrivalTime,
        isSwitch: nextNode.type === "switch"
      });
      currentTime = arrivalTime;
    }
  }
  const totalTime = positions.length > 0 ? positions[positions.length - 1].arrivalTime - cart.departureTime : 0;
  return {
    cartId: cart.id,
    cartName: cart.name,
    positions,
    totalDistance: pathResult2.totalDistance,
    totalTime,
    switchCount: pathResult2.switchCount,
    hasPath: true,
    waitTime: 0
  };
}
function timeOverlap(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}
function getEdgeOccupancyTime(position, prevPosition) {
  if (!prevPosition || !position.edgeId) return null;
  return {
    startTime: prevPosition.departureTime,
    endTime: position.arrivalTime
  };
}
function getNodeOccupancyTime(position) {
  const buffer = 1;
  return {
    startTime: position.arrivalTime - buffer,
    endTime: position.departureTime + buffer
  };
}
function detectConflicts(routes, edges2, carts2) {
  const conflicts = [];
  const cartMap = new Map(carts2.map((c) => [c.id, c]));
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const route1 = routes[i];
      const route2 = routes[j];
      if (!route1.hasPath || !route2.hasPath) continue;
      const cart1 = cartMap.get(route1.cartId);
      const cart2 = cartMap.get(route2.cartId);
      if (!cart1 || !cart2) continue;
      detectEdgeConflicts(route1, route2, edges2, cart1, cart2, conflicts);
      detectNodeConflicts(route1, route2, cart1, cart2, conflicts);
      detectSwitchConflicts(route1, route2, cart1, cart2, conflicts);
    }
  }
  return conflicts;
}
function detectEdgeConflicts(route1, route2, edges2, cart1, cart2, conflicts) {
  for (let i = 1; i < route1.positions.length; i++) {
    const pos1 = route1.positions[i];
    const prevPos1 = route1.positions[i - 1];
    const occupancy1 = getEdgeOccupancyTime(pos1, prevPos1);
    if (!occupancy1 || !pos1.edgeId) continue;
    for (let j = 1; j < route2.positions.length; j++) {
      const pos2 = route2.positions[j];
      const prevPos2 = route2.positions[j - 1];
      const occupancy2 = getEdgeOccupancyTime(pos2, prevPos2);
      if (!occupancy2 || !pos2.edgeId) continue;
      if (pos1.edgeId === pos2.edgeId) {
        if (timeOverlap(occupancy1.startTime, occupancy1.endTime, occupancy2.startTime, occupancy2.endTime)) {
          const edge = getEdgeById(edges2, pos1.edgeId);
          const duration = Math.min(occupancy1.endTime, occupancy2.endTime) - Math.max(occupancy1.startTime, occupancy2.startTime);
          const severity = duration > 10 ? "high" : duration > 5 ? "medium" : "low";
          conflicts.push({
            id: createConflictId(),
            type: "edge",
            edgeId: pos1.edgeId,
            cart1Id: cart1.id,
            cart2Id: cart2.id,
            cart1Name: cart1.name,
            cart2Name: cart2.name,
            startTime: Math.max(occupancy1.startTime, occupancy2.startTime),
            endTime: Math.min(occupancy1.endTime, occupancy2.endTime),
            severity,
            description: `${cart1.name} 与 ${cart2.name} 在轨道 ${edge ? edge.id.slice(0, 8) : pos1.edgeId.slice(0, 8)} 上发生路径冲突，重叠时长约 ${duration.toFixed(1)} 单位时间`
          });
        }
      }
    }
  }
}
function detectNodeConflicts(route1, route2, cart1, cart2, conflicts) {
  for (const pos1 of route1.positions) {
    const occupancy1 = getNodeOccupancyTime(pos1);
    for (const pos2 of route2.positions) {
      if (pos1.nodeId === pos2.nodeId) {
        const occupancy2 = getNodeOccupancyTime(pos2);
        if (timeOverlap(occupancy1.startTime, occupancy1.endTime, occupancy2.startTime, occupancy2.endTime)) {
          const isSameStart = pos1.nodeId === cart1.sourceId && pos1.nodeId === cart2.sourceId;
          const isSameEnd = pos1.nodeId === cart1.targetId && pos1.nodeId === cart2.targetId;
          if (!isSameStart && !isSameEnd) {
            const duration = Math.min(occupancy1.endTime, occupancy2.endTime) - Math.max(occupancy1.startTime, occupancy2.startTime);
            const severity = duration > 8 ? "high" : duration > 4 ? "medium" : "low";
            conflicts.push({
              id: createConflictId(),
              type: "node",
              nodeId: pos1.nodeId,
              cart1Id: cart1.id,
              cart2Id: cart2.id,
              cart1Name: cart1.name,
              cart2Name: cart2.name,
              startTime: Math.max(occupancy1.startTime, occupancy2.startTime),
              endTime: Math.min(occupancy1.endTime, occupancy2.endTime),
              severity,
              description: `${cart1.name} 与 ${cart2.name} 在节点 ${pos1.nodeId.slice(0, 8)} 发生交汇冲突`
            });
          }
        }
      }
    }
  }
}
function detectSwitchConflicts(route1, route2, cart1, cart2, conflicts) {
  for (const pos1 of route1.positions) {
    if (!pos1.isSwitch) continue;
    const occupancy1 = getNodeOccupancyTime(pos1);
    for (const pos2 of route2.positions) {
      if (!pos2.isSwitch) continue;
      if (pos1.nodeId !== pos2.nodeId) continue;
      const occupancy2 = getNodeOccupancyTime(pos2);
      if (timeOverlap(occupancy1.startTime, occupancy1.endTime, occupancy2.startTime, occupancy2.endTime)) {
        const severity = "high";
        const existingConflict = conflicts.find(
          (c) => c.type === "node" && c.nodeId === pos1.nodeId && (c.cart1Id === cart1.id && c.cart2Id === cart2.id || c.cart1Id === cart2.id && c.cart2Id === cart1.id)
        );
        if (!existingConflict) {
          conflicts.push({
            id: createConflictId(),
            type: "switch",
            nodeId: pos1.nodeId,
            cart1Id: cart1.id,
            cart2Id: cart2.id,
            cart1Name: cart1.name,
            cart2Name: cart2.name,
            startTime: Math.max(occupancy1.startTime, occupancy2.startTime),
            endTime: Math.min(occupancy1.endTime, occupancy2.endTime),
            severity,
            description: `${cart1.name} 与 ${cart2.name} 在岔道节点 ${pos1.nodeId.slice(0, 8)} 发生岔道争用冲突，需要协调通过顺序`
          });
        }
      }
    }
  }
}
function resolveConflictsWithPriority(routes, conflicts, carts2, nodes2, edges2) {
  const cartMap = new Map(carts2.map((c) => [c.id, c]));
  const routeMap = new Map(routes.map((r) => [r.cartId, { ...r, positions: [...r.positions] }]));
  let unresolvedConflicts = [...conflicts];
  const maxIterations = 20;
  for (let iteration = 0; iteration < maxIterations && unresolvedConflicts.length > 0; iteration++) {
    const newConflicts = [];
    for (const conflict of unresolvedConflicts) {
      const cart1 = cartMap.get(conflict.cart1Id);
      const cart2 = cartMap.get(conflict.cart2Id);
      if (!cart1 || !cart2) continue;
      const lowerPriorityCart = cart1.priority <= cart2.priority ? cart2 : cart1;
      const higherPriorityCart = cart1.priority <= cart2.priority ? cart1 : cart2;
      const lowerRoute = routeMap.get(lowerPriorityCart.id);
      const higherRoute = routeMap.get(higherPriorityCart.id);
      if (!lowerRoute || !higherRoute || !lowerRoute.hasPath) continue;
      const waitTime = conflict.endTime - conflict.startTime + 2;
      const originalDeparture = lowerPriorityCart.departureTime;
      if (iteration > 0) {
        const firstPos = lowerRoute.positions[0];
        if (firstPos) {
          firstPos.departureTime - originalDeparture + waitTime;
        }
      }
      lowerRoute.positions = lowerRoute.positions.map((pos, idx) => ({
        ...pos,
        arrivalTime: pos.arrivalTime + waitTime,
        departureTime: idx === 0 ? pos.departureTime + waitTime : pos.departureTime + waitTime
      }));
      lowerRoute.waitTime += waitTime;
      lowerRoute.totalTime += waitTime;
    }
    const updatedRoutes = Array.from(routeMap.values());
    newConflicts.push(...detectConflicts(updatedRoutes, edges2, carts2));
    if (newConflicts.length === 0) {
      unresolvedConflicts = [];
      break;
    } else if (newConflicts.length < unresolvedConflicts.length) {
      unresolvedConflicts = newConflicts;
    } else {
      break;
    }
  }
  return {
    routes: Array.from(routeMap.values()),
    conflicts: unresolvedConflicts,
    resolved: unresolvedConflicts.length === 0
  };
}
function calculateDispatch(nodes2, edges2, carts2) {
  const sortedCarts = [...carts2].sort((a, b) => b.priority - a.priority);
  const routes = sortedCarts.map(
    (cart) => buildTimedRoute(nodes2, edges2, cart)
  );
  const initialConflicts = detectConflicts(routes, edges2, carts2);
  const { routes: resolvedRoutes, conflicts: remainingConflicts } = resolveConflictsWithPriority(
    routes,
    initialConflicts,
    carts2,
    nodes2,
    edges2
  );
  const finalRoutes = carts2.map((cart) => {
    const route = resolvedRoutes.find((r) => r.cartId === cart.id);
    return route || {
      cartId: cart.id,
      cartName: cart.name,
      positions: [],
      totalDistance: 0,
      totalTime: 0,
      switchCount: 0,
      hasPath: false,
      waitTime: 0
    };
  });
  const totalTime = Math.max(...finalRoutes.map((r) => r.positions.length > 0 ? r.positions[r.positions.length - 1].arrivalTime : 0));
  const totalDistance = finalRoutes.reduce((sum, r) => sum + r.totalDistance, 0);
  const totalSwitchCount = finalRoutes.reduce((sum, r) => sum + r.switchCount, 0);
  const highConflicts = remainingConflicts.filter((c) => c.severity === "high").length;
  const mediumConflicts = remainingConflicts.filter((c) => c.severity === "medium").length;
  const lowConflicts = remainingConflicts.filter((c) => c.severity === "low").length;
  const congestionRisk = Math.min(100, highConflicts * 30 + mediumConflicts * 15 + lowConflicts * 5);
  const hasAllPaths = finalRoutes.every((r) => r.hasPath);
  return {
    routes: finalRoutes,
    conflicts: remainingConflicts,
    totalTime,
    totalDistance,
    totalSwitchCount,
    congestionRisk,
    hasAllPaths
  };
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
const carts = writable([]);
derived(
  [nodes, edges, carts],
  ([$nodes, $edges, $carts]) => {
    if ($carts.length === 0) {
      return {
        routes: [],
        conflicts: [],
        totalTime: 0,
        totalDistance: 0,
        totalSwitchCount: 0,
        congestionRisk: 0,
        hasAllPaths: false
      };
    }
    return calculateDispatch($nodes, $edges, $carts);
  }
);
const CytoscapeGraph = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { addMode = null } = $$props;
  let { playbackFrame = null } = $$props;
  createEventDispatcher();
  let cyContainer;
  let cy = null;
  function updatePlaybackCarts(frame) {
    if (!cy) return;
    cy.elements(".cart-node").remove();
    cy.elements("edge").removeClass("congested");
    if (!frame || frame.cartStates.length === 0) return;
    const cartElements = frame.cartStates.map((cartState) => ({
      group: "nodes",
      data: {
        id: `cart_${cartState.cartId}`,
        label: cartState.cartName,
        cartColor: cartState.color,
        isCart: true
      },
      position: { x: cartState.x, y: cartState.y },
      classes: "cart-node"
    }));
    cy.add(cartElements);
    frame.congestedEdges.forEach((congested) => {
      const edge = cy.$id(congested.edgeId);
      if (edge.length > 0) {
        edge.addClass("congested");
      }
    });
  }
  onDestroy(() => {
    if (cy) cy.destroy();
    cy = null;
  });
  if ($$props.addMode === void 0 && $$bindings.addMode && addMode !== void 0) $$bindings.addMode(addMode);
  if ($$props.playbackFrame === void 0 && $$bindings.playbackFrame && playbackFrame !== void 0) $$bindings.playbackFrame(playbackFrame);
  {
    if (cy) {
      updatePlaybackCarts(playbackFrame);
    }
  }
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
  const selectedNode = derived([selectedNodeId, nodes], ([$id, $nodes]) => {
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
    if ($selectedNode && true) {
      editLabel = $selectedNode.label;
      $selectedNode.type;
      editBlocked = $selectedNode.blocked;
      labelError = "";
    }
  }
  $$unsubscribe_selectedNode();
  return `<div class="card p-4 space-y-3"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-n216zh">节点属性</h3> ${$selectedNode ? `<div class="space-y-3"><div><label for="nodeLabel" class="label" data-svelte-h="svelte-1ycvqw1">节点编号</label> <input id="nodeLabel" type="text" class="${"input " + escape(labelError ? "input-error" : "", true)}"${add_attribute("value", editLabel, 0)}> ${labelError ? `<p class="text-xs text-error-500 mt-1">${escape(labelError)}</p>` : ``}</div> <div><label for="nodeType" class="label" data-svelte-h="svelte-j2i8fs">节点类型</label> <select id="nodeType" class="select">${each(typeOptions, (opt) => {
    return `<option${add_attribute("value", opt.value, 0)}>${escape(opt.label)}</option>`;
  })}</select></div> <div class="flex items-center gap-2"><input type="checkbox" class="checkbox" id="blocked"${add_attribute("checked", editBlocked, 1)}> <label for="blocked" class="label cursor-pointer" data-svelte-h="svelte-bq0caf">标记为堵塞</label></div> <button class="btn btn-sm variant-filled-error w-full" data-svelte-h="svelte-11bwjxl">删除节点</button></div>` : `<p class="text-sm text-tertiary-500" data-svelte-h="svelte-1o2dqk4">点击选择一个节点进行编辑</p>`}</div>`;
});
const EdgePanel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $selectedEdge, $$unsubscribe_selectedEdge;
  const selectedEdge = derived([selectedEdgeId, edges, nodes], ([$id, $edges, $nodes]) => {
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
    if ($selectedEdge && true) {
      editLength = $selectedEdge.edge.length;
      lengthError = "";
    }
  }
  $$unsubscribe_selectedEdge();
  return `<div class="card p-4 space-y-3"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-1je7gnx">轨道属性</h3> ${$selectedEdge ? `<div class="space-y-3"><p class="text-sm text-tertiary-600">节点 ${escape($selectedEdge.sourceLabel)} → ${escape($selectedEdge.targetLabel)}</p> <div><label for="edgeLength" class="label" data-svelte-h="svelte-xph6qm">轨道长度</label> <input id="edgeLength" type="number" class="${"input " + escape(lengthError ? "input-error" : "", true)}" min="1"${add_attribute("value", editLength, 0)}> ${lengthError ? `<p class="text-xs text-error-500 mt-1">${escape(lengthError)}</p>` : ``}</div> <div class="flex items-center gap-2"><input type="checkbox" class="checkbox" id="edgeEnabled" ${$selectedEdge.edge.enabled ? "checked" : ""}> <label for="edgeEnabled" class="label cursor-pointer" data-svelte-h="svelte-t454nr">启用轨道</label></div> <div class="flex items-center gap-2"><input type="checkbox" class="checkbox" id="isSwitch" ${$selectedEdge.edge.isSwitch ? "checked" : ""}> <label for="isSwitch" class="label cursor-pointer" data-svelte-h="svelte-b6b9w">是岔道开关</label></div> ${$selectedEdge.edge.isSwitch ? `<div class="p-2 bg-warning-50 rounded"><div class="flex items-center justify-between"><span class="text-sm" data-svelte-h="svelte-6ao855">岔道状态:</span> <span class="${[
    "font-medium",
    ($selectedEdge.edge.switchActive ? "text-warning-700" : "") + " " + (!$selectedEdge.edge.switchActive ? "text-gray-500" : "")
  ].join(" ").trim()}">${escape($selectedEdge.edge.switchActive ? "开启" : "关闭")}</span></div> <button class="btn btn-sm variant-filled-warning w-full mt-2" ${!$selectedEdge.edge.enabled ? "disabled" : ""}>切换岔道状态</button></div>` : ``} <button class="btn btn-sm variant-filled-error w-full" data-svelte-h="svelte-1gng76l">删除轨道</button></div>` : `<p class="text-sm text-tertiary-500" data-svelte-h="svelte-10yuy6j">点击选择一条轨道进行编辑</p>`}</div>`;
});
const PathPanel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $loadingNodeId, $$unsubscribe_loadingNodeId;
  let $loadingNodes, $$unsubscribe_loadingNodes;
  let $unloadingNodeId, $$unsubscribe_unloadingNodeId;
  let $unloadingNodes, $$unsubscribe_unloadingNodes;
  let $pathResult, $$unsubscribe_pathResult;
  $$unsubscribe_loadingNodeId = subscribe(loadingNodeId, (value) => $loadingNodeId = value);
  $$unsubscribe_unloadingNodeId = subscribe(unloadingNodeId, (value) => $unloadingNodeId = value);
  $$unsubscribe_pathResult = subscribe(pathResult, (value) => $pathResult = value);
  const loadingNodes = derived(nodes, ($nodes) => $nodes.filter((n) => n.type === "loading"));
  $$unsubscribe_loadingNodes = subscribe(loadingNodes, (value) => $loadingNodes = value);
  const unloadingNodes = derived(nodes, ($nodes) => $nodes.filter((n) => n.type === "unloading"));
  $$unsubscribe_unloadingNodes = subscribe(unloadingNodes, (value) => $unloadingNodes = value);
  derived([loadingNodeId, nodes], ([$id, $nodes]) => {
    return $nodes.find((n) => n.id === $id);
  });
  derived([unloadingNodeId, nodes], ([$id, $nodes]) => {
    return $nodes.find((n) => n.id === $id);
  });
  function getNodeLabel(nodeId) {
    const node = get_store_value(nodes).find((n) => n.id === nodeId);
    return node?.label || nodeId;
  }
  $$unsubscribe_loadingNodeId();
  $$unsubscribe_loadingNodes();
  $$unsubscribe_unloadingNodeId();
  $$unsubscribe_unloadingNodes();
  $$unsubscribe_pathResult();
  return `<div class="card p-4 space-y-3"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-qoiky">路径信息</h3> <div class="space-y-2"><div><label for="loadingSelect" class="label text-sm" data-svelte-h="svelte-gc582u">装载点</label> <select id="loadingSelect" class="select"${add_attribute("value", $loadingNodeId, 0)} ${$loadingNodes.length === 0 ? "disabled" : ""}>${$loadingNodes.length === 0 ? `<option value="" data-svelte-h="svelte-kihmar">暂无装载点</option>` : `${each($loadingNodes, (node) => {
    return `<option${add_attribute("value", node.id, 0)}>${escape(node.label)}</option>`;
  })}`}</select></div> <div><label for="unloadingSelect" class="label text-sm" data-svelte-h="svelte-1jt37ei">卸载点</label> <select id="unloadingSelect" class="select"${add_attribute("value", $unloadingNodeId, 0)} ${$unloadingNodes.length === 0 ? "disabled" : ""}>${$unloadingNodes.length === 0 ? `<option value="" data-svelte-h="svelte-efhgew">暂无卸载点</option>` : `${each($unloadingNodes, (node) => {
    return `<option${add_attribute("value", node.id, 0)}>${escape(node.label)}</option>`;
  })}`}</select></div></div> <hr class="my-2"> ${$pathResult.hasPath ? `<div class="space-y-2"><div class="bg-success-50 p-3 rounded-lg" data-svelte-h="svelte-18wcaqo"><p class="text-success-700 font-medium text-sm">✓ 找到可行路线</p></div> <div class="text-sm space-y-1"><div class="flex justify-between"><span class="text-tertiary-600" data-svelte-h="svelte-l2732b">总距离:</span> <span class="font-bold">${escape($pathResult.totalDistance)}</span></div> <div class="flex justify-between"><span class="text-tertiary-600" data-svelte-h="svelte-nt1q9v">经过岔道数:</span> <span class="font-bold text-amber-600">${escape($pathResult.switchCount)}</span></div> <div class="flex justify-between"><span class="text-tertiary-600" data-svelte-h="svelte-2mg153">经过节点数:</span> <span class="font-bold">${escape($pathResult.nodes.length)}</span></div></div> <div><p class="text-sm text-tertiary-600 mb-1" data-svelte-h="svelte-1rrjh6f">路径节点:</p> <div class="flex flex-wrap gap-1">${each($pathResult.nodes, (nodeId, index) => {
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
  let schemesSorted;
  let $$unsubscribe_unloadingNodeId;
  let $$unsubscribe_loadingNodeId;
  let $schemes, $$unsubscribe_schemes;
  let $currentSchemeName, $$unsubscribe_currentSchemeName;
  $$unsubscribe_unloadingNodeId = subscribe(unloadingNodeId, (value) => value);
  $$unsubscribe_loadingNodeId = subscribe(loadingNodeId, (value) => value);
  $$unsubscribe_schemes = subscribe(schemes, (value) => $schemes = value);
  $$unsubscribe_currentSchemeName = subscribe(currentSchemeName, (value) => $currentSchemeName = value);
  schemesSorted = (() => {
    return [...$schemes].sort((a, b) => b.updatedAt - a.updatedAt);
  })();
  $$unsubscribe_unloadingNodeId();
  $$unsubscribe_loadingNodeId();
  $$unsubscribe_schemes();
  $$unsubscribe_currentSchemeName();
  return `<div class="card p-4 space-y-3"><div class="flex items-center justify-between"><h3 class="text-lg font-bold text-primary-900" data-svelte-h="svelte-7zlmst">方案管理</h3> <div class="flex gap-1"><button class="${[
    "btn btn-sm variant-soft-secondary",
    ""
  ].join(" ").trim()}" ${$schemes.length < 2 ? "disabled" : ""}>对比</button> <button class="btn btn-sm variant-filled-primary">${escape("保存方案")}</button></div></div> <div><p class="text-sm text-tertiary-600">当前方案: <span class="font-medium text-primary-700">${escape($currentSchemeName)}</span></p></div> ${``} ${``} <hr class="my-2"> <div class="space-y-2 max-h-60 overflow-y-auto">${schemesSorted.length === 0 ? `<p class="text-sm text-tertiary-500 text-center py-4" data-svelte-h="svelte-zktfcy">暂无保存的方案</p>` : `${each(schemesSorted, (scheme) => {
    return `<div class="${[
      "p-2 rounded border border-surface-300 hover:bg-surface-50 transition-colors",
      (scheme.name === $currentSchemeName ? "border-primary-400" : "") + " " + (scheme.name === $currentSchemeName ? "bg-primary-50" : "")
    ].join(" ").trim()}"><div class="flex items-center gap-2">${``} <div class="flex-1 min-w-0"><div class="flex items-center justify-between"><span class="font-medium text-sm truncate">${escape(scheme.name)}</span> <span class="text-xs text-tertiary-500 flex-shrink-0">${escape(formatDate(scheme.updatedAt))} </span></div> <div class="text-xs text-tertiary-500 mt-1">${escape(scheme.nodes.length)} 个节点 · ${escape(scheme.edges.length)} 条轨道</div> </div></div> <div class="flex gap-1 mt-2"><button class="btn btn-xs variant-soft-primary flex-1" data-svelte-h="svelte-el0cs">加载</button> <button class="btn btn-xs variant-soft-error" data-svelte-h="svelte-11cav73">删除
						</button></div> </div>`;
  })}`}</div></div>`;
});
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let addMode = null;
  let playbackFrame = null;
  let $$settled;
  let $$rendered;
  let previous_head = $$result.head;
  do {
    $$settled = true;
    $$result.head = previous_head;
    $$rendered = `<div class="min-h-screen bg-surface-200 flex flex-col"><header class="bg-surface-900 text-surface-50 px-6 py-4 shadow-lg flex-shrink-0"><div class="flex items-center justify-between"><div data-svelte-h="svelte-46xya4"><h1 class="text-2xl font-bold text-primary-400">⛏ 老矿洞轨道模拟系统</h1> <p class="text-sm text-surface-400">绘制矿洞轨道 · 计算运输路线 · 分析堵塞风险</p></div> <div class="flex items-center gap-4"><button class="${[
      "btn btn-sm",
      " variant-soft-secondary"
    ].join(" ").trim()}" data-svelte-h="svelte-1if8gf3">🚚 调度中心</button> <div class="text-sm text-surface-400 text-right" data-svelte-h="svelte-3zxl7i"><p>节点编号不能重复</p> <p>轨道长度必须大于 0</p></div></div></div></header> <div class="flex flex-1 overflow-hidden"><aside class="w-72 bg-surface-100 border-r border-surface-300 p-4 space-y-4 overflow-y-auto flex-shrink-0">${validate_component(ToolPanel, "ToolPanel").$$render(
      $$result,
      { addMode },
      {
        addMode: ($$value) => {
          addMode = $$value;
          $$settled = false;
        }
      },
      {}
    )} ${validate_component(NodePanel, "NodePanel").$$render($$result, {}, {}, {})} ${validate_component(EdgePanel, "EdgePanel").$$render($$result, {}, {}, {})}</aside> <main class="flex-1 p-4 min-w-0"><div class="w-full h-full bg-white rounded-xl shadow-md overflow-hidden">${validate_component(CytoscapeGraph, "CytoscapeGraph").$$render($$result, { addMode, playbackFrame }, {}, {})}</div></main> <aside class="w-80 bg-surface-100 border-l border-surface-300 p-4 space-y-4 overflow-y-auto flex-shrink-0">${`${validate_component(PathPanel, "PathPanel").$$render($$result, {}, {}, {})} ${validate_component(SchemePanel, "SchemePanel").$$render($$result, {}, {}, {})} <div class="card p-4 space-y-2" data-svelte-h="svelte-cjstnm"><h3 class="text-lg font-bold text-primary-900">图例说明</h3> <div class="space-y-2 text-sm"><div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-green-500 border-2 border-gray-800"></div> <span>装载点</span></div> <div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-blue-500 border-2 border-gray-800"></div> <span>卸载点</span></div> <div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-amber-500 border-2 border-gray-800"></div> <span>岔道节点</span></div> <div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-gray-500 border-2 border-gray-800"></div> <span>普通节点</span></div> <div class="flex items-center gap-2"><div class="w-5 h-5 rounded-full bg-red-500 border-2 border-gray-800"></div> <span>堵塞节点</span></div> <hr class="my-2"> <div class="flex items-center gap-2"><div class="w-8 h-1 bg-gray-700"></div> <span>普通轨道</span></div> <div class="flex items-center gap-2"><div class="w-8 h-1 bg-amber-500"></div> <span>岔道（开启）</span></div> <div class="flex items-center gap-2"><div class="w-8 h-0.5 bg-gray-300 border-t border-dashed"></div> <span>关闭轨道</span></div> <div class="flex items-center gap-2"><div class="w-8 h-1 bg-green-500"></div> <span>最短路径</span></div></div></div>`}</aside></div></div>`;
  } while (!$$settled);
  return $$rendered;
});
export {
  Page as default
};
