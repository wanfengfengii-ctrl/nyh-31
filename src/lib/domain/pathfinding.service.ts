// ============================================================================
//  路径计算服务 (Pathfinding Service)
// ============================================================================
//  提供基于 Dijkstra 算法的最短路径计算
//  支持考虑时间窗占用的路径规划（用于调度推演）
// ============================================================================

import type {
	MineNode,
	MineEdge,
	PathResult,
	Cart,
	CartRoute,
	TimedPosition,
	OccupancyTable
} from './models';
import {
	buildAdjacencyList,
	buildNodeMap,
	getEdgeById,
	findBrokenNodes,
	createOccupancyTable,
	addEdgeOccupancy,
	addNodeOccupancy,
	findEarliestAvailableTime,
	calculateTravelTime
} from './network.service';

// ============================================================================
//  最短路径计算 (Dijkstra)
// ============================================================================

/**
 * 计算两点间的最短路径（基于距离）
 * 考虑轨道可用性、道岔状态、节点阻塞
 */
export function calculateShortestPath(
	nodes: MineNode[],
	edges: MineEdge[],
	sourceId: string,
	targetId: string
): PathResult {
	const nodeMap = buildNodeMap(nodes);
	const adjacency = buildAdjacencyList(nodes, edges);

	const distances = new Map<string, number>();
	const previous = new Map<string, { nodeId: string; edgeId: string } | null>();
	const visited = new Set<string>();

	nodes.forEach((n) => {
		distances.set(n.id, Infinity);
		previous.set(n.id, null);
	});
	distances.set(sourceId, 0);

	while (visited.size < nodes.length) {
		let minDist = Infinity;
		let currentNode = '';

		nodes.forEach((n) => {
			if (!visited.has(n.id) && (distances.get(n.id) ?? Infinity) < minDist) {
				minDist = distances.get(n.id) ?? Infinity;
				currentNode = n.id;
			}
		});

		if (minDist === Infinity || currentNode === '') break;
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

	const blockedNodes = nodes.filter((n) => n.blocked).map((n) => n.id);

	if (!distances.has(targetId) || distances.get(targetId) === Infinity) {
		const brokenNodes = findBrokenNodes(nodes, edges, sourceId);
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

	const pathNodes: string[] = [];
	const pathEdges: string[] = [];
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
		const edge = getEdgeById(edges, edgeId);
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

// ============================================================================
//  时间窗路径规划 (Time-Window Pathfinding)
// ============================================================================

interface PathState {
	nodeId: string;
	arrivalTime: number;
	departureTime: number;
	distance: number;
	switchCount: number;
	previousNode: string | null;
	previousEdge: string | null;
}

/**
 * 考虑时间窗占用的最短路径规划
 * 用于调度推演中，避免多车冲突
 */
export function findTimeWindowPath(
	nodes: MineNode[],
	edges: MineEdge[],
	cart: Cart,
	occupancyTable: OccupancyTable
): CartRoute {
	const adjacency = buildAdjacencyList(nodes, edges);
	const nodeMap = buildNodeMap(nodes);

	const nodeBuffer = 0.5;
	const edgeBuffer = 0.3;

	const distances = new Map<string, number>();
	const previous = new Map<string, { nodeId: string; edgeId: string } | null>();
	const arrivalTimes = new Map<string, number>();
	const departureTimes = new Map<string, number>();
	const switchCounts = new Map<string, number>();
	const totalDistances = new Map<string, number>();

	nodes.forEach((n) => {
		distances.set(n.id, Infinity);
		arrivalTimes.set(n.id, Infinity);
		departureTimes.set(n.id, Infinity);
		switchCounts.set(n.id, 0);
		totalDistances.set(n.id, 0);
		previous.set(n.id, null);
	});

	const sourceNode = nodeMap.get(cart.sourceId);
	if (!sourceNode || sourceNode.blocked) {
		return createEmptyRoute(cart);
	}

	const initialDeparture = findEarliestAvailableTime(
		occupancyTable.nodeOccupancies.get(cart.sourceId),
		cart.departureTime,
		0,
		nodeBuffer
	);

	distances.set(cart.sourceId, 0);
	arrivalTimes.set(cart.sourceId, initialDeparture);
	departureTimes.set(cart.sourceId, initialDeparture);
	switchCounts.set(cart.sourceId, 0);
	totalDistances.set(cart.sourceId, 0);

	const visited = new Set<string>();

	while (visited.size < nodes.length) {
		let minArrival = Infinity;
		let currentNode = '';

		nodes.forEach((n) => {
			if (!visited.has(n.id) && (arrivalTimes.get(n.id) ?? Infinity) < minArrival) {
				minArrival = arrivalTimes.get(n.id) ?? Infinity;
				currentNode = n.id;
			}
		});

		if (minArrival === Infinity || currentNode === '') break;
		visited.add(currentNode);

		if (currentNode === cart.targetId) break;

		const neighbors = adjacency.get(currentNode) || [];
		const currentDeparture = departureTimes.get(currentNode) ?? 0;

		for (const neighbor of neighbors) {
			if (visited.has(neighbor.nodeId)) continue;

			const travelTime = calculateTravelTime(neighbor.length, cart.speed);

			const edgeOccupancies = occupancyTable.edgeOccupancies.get(neighbor.edgeId);
			const edgeStart = findEarliestAvailableTime(
				edgeOccupancies,
				currentDeparture,
				travelTime,
				edgeBuffer
			);

			const waitBeforeEdge = edgeStart - currentDeparture;
			const edgeArrival = edgeStart + travelTime;

			const targetNode = nodeMap.get(neighbor.nodeId);
			const isSwitchNode = targetNode?.type === 'switch';
			const nodeStayTime = isSwitchNode ? 1 : 0.5;

			const nodeOccupancies = occupancyTable.nodeOccupancies.get(neighbor.nodeId);
			const nodeAvailableStart = findEarliestAvailableTime(
				nodeOccupancies,
				edgeArrival,
				nodeStayTime,
				nodeBuffer
			);

			const waitAtNode = Math.max(0, nodeAvailableStart - edgeArrival);
			const nodeDeparture = nodeAvailableStart;

			const newTotalDistance = (totalDistances.get(currentNode) ?? 0) + neighbor.length;
			const newSwitchCount = (switchCounts.get(currentNode) ?? 0) + (neighbor.isSwitch ? 1 : 0);

			if (nodeAvailableStart < (arrivalTimes.get(neighbor.nodeId) ?? Infinity)) {
				arrivalTimes.set(neighbor.nodeId, nodeAvailableStart);
				departureTimes.set(neighbor.nodeId, nodeDeparture);
				distances.set(neighbor.nodeId, nodeAvailableStart);
				switchCounts.set(neighbor.nodeId, newSwitchCount);
				totalDistances.set(neighbor.nodeId, newTotalDistance);
				previous.set(neighbor.nodeId, { nodeId: currentNode, edgeId: neighbor.edgeId });
			}
		}
	}

	const targetArrival = arrivalTimes.get(cart.targetId);
	if (!targetArrival || targetArrival === Infinity) {
		return createEmptyRoute(cart);
	}

	const positions: TimedPosition[] = [];
	let current = cart.targetId;

	while (current !== cart.sourceId) {
		const prev = previous.get(current);
		const node = nodeMap.get(current);
		if (!prev || !node) break;

		positions.unshift({
			nodeId: current,
			edgeId: prev.edgeId,
			arrivalTime: arrivalTimes.get(current) ?? 0,
			departureTime: departureTimes.get(current) ?? 0,
			isSwitch: node.type === 'switch'
		});

		current = prev.nodeId;
	}

	const sourceNodeObj = nodeMap.get(cart.sourceId);
	if (sourceNodeObj) {
		positions.unshift({
			nodeId: cart.sourceId,
			edgeId: null,
			arrivalTime: arrivalTimes.get(cart.sourceId) ?? cart.departureTime,
			departureTime: departureTimes.get(cart.sourceId) ?? cart.departureTime,
			isSwitch: sourceNodeObj.type === 'switch'
		});
	}

	const totalTime = targetArrival - cart.departureTime;
	let totalWaitTime = 0;
	for (let i = 0; i < positions.length; i++) {
		const pos = positions[i];
		const wait = pos.departureTime - pos.arrivalTime;
		if (wait > 0.01) {
			totalWaitTime += wait;
		}
	}

	return {
		cartId: cart.id,
		cartName: cart.name,
		positions,
		totalDistance: totalDistances.get(cart.targetId) ?? 0,
		totalTime,
		switchCount: switchCounts.get(cart.targetId) ?? 0,
		hasPath: true,
		waitTime: totalWaitTime
	};
}

// ============================================================================
//  带时间的路线构建
// ============================================================================

/**
 * 基于最短路径构建带时间戳的小车路线
 * （不考虑冲突，仅用于单一车辆的时间估算）
 */
export function buildTimedRoute(
	nodes: MineNode[],
	edges: MineEdge[],
	cart: Cart
): CartRoute {
	const pathResult = calculateShortestPath(nodes, edges, cart.sourceId, cart.targetId);

	if (!pathResult.hasPath) {
		return createEmptyRoute(cart);
	}

	const positions: TimedPosition[] = [];
	let currentTime = cart.departureTime;

	const nodeMap = buildNodeMap(nodes);
	const sourceNode = nodeMap.get(cart.sourceId);
	if (sourceNode) {
		positions.push({
			nodeId: cart.sourceId,
			edgeId: null,
			arrivalTime: currentTime,
			departureTime: currentTime,
			isSwitch: sourceNode.type === 'switch'
		});
	}

	for (let i = 0; i < pathResult.edges.length; i++) {
		const edgeId = pathResult.edges[i];
		const edge = getEdgeById(edges, edgeId);
		const nextNodeId = pathResult.nodes[i + 1];
		const nextNode = nodeMap.get(nextNodeId);

		if (edge && nextNode) {
			const travelTime = calculateTravelTime(edge.length, cart.speed);
			const arrivalTime = currentTime + travelTime;

			positions.push({
				nodeId: nextNodeId,
				edgeId: edgeId,
				arrivalTime,
				departureTime: arrivalTime,
				isSwitch: nextNode.type === 'switch'
			});

			currentTime = arrivalTime;
		}
	}

	const totalTime = positions.length > 0
		? positions[positions.length - 1].arrivalTime - cart.departureTime
		: 0;

	return {
		cartId: cart.id,
		cartName: cart.name,
		positions,
		totalDistance: pathResult.totalDistance,
		totalTime,
		switchCount: pathResult.switchCount,
		hasPath: true,
		waitTime: 0
	};
}

// ============================================================================
//  工具函数
// ============================================================================

/**
 * 创建空的路线（无路径时使用）
 */
export function createEmptyRoute(cart: Cart): CartRoute {
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

/**
 * 将路线添加到占用表中
 */
export function addRouteToOccupancyTable(
	table: OccupancyTable,
	route: CartRoute,
	cartId: string
): void {
	const positions = route.positions;
	if (positions.length < 2) return;

	for (let i = 0; i < positions.length; i++) {
		const pos = positions[i];

		const nodeStayStart = pos.arrivalTime;
		const nodeStayEnd = pos.departureTime;
		if (nodeStayEnd > nodeStayStart) {
			addNodeOccupancy(table, pos.nodeId, nodeStayStart, nodeStayEnd, cartId);
		}

		if (i > 0 && pos.edgeId) {
			const prevPos = positions[i - 1];
			const edgeStart = prevPos.departureTime;
			const edgeEnd = pos.arrivalTime;
			addEdgeOccupancy(table, pos.edgeId, edgeStart, edgeEnd, cartId);
		}
	}
}
