import { calculateShortestPath } from './pathfinding';
import type {
	MineNode,
	MineEdge,
	Cart,
	CartRoute,
	TimedPosition,
	Conflict,
	DispatchResult,
	PlaybackFrame,
	PlaybackEvent
} from './types';

function createCartId(): string {
	return `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createConflictId(): string {
	return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getEdgeById(edges: MineEdge[], edgeId: string): MineEdge | undefined {
	return edges.find((e) => e.id === edgeId);
}

function getNodeById(nodes: MineNode[], nodeId: string): MineNode | undefined {
	return nodes.find((n) => n.id === nodeId);
}

function calculateTravelTime(length: number, speed: number): number {
	if (speed <= 0) return Infinity;
	return length / speed;
}

export function buildTimedRoute(
	nodes: MineNode[],
	edges: MineEdge[],
	cart: Cart
): CartRoute {
	const pathResult = calculateShortestPath(nodes, edges, cart.sourceId, cart.targetId);

	if (!pathResult.hasPath) {
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

	const positions: TimedPosition[] = [];
	let currentTime = cart.departureTime;

	const sourceNode = getNodeById(nodes, cart.sourceId);
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
		const nextNode = getNodeById(nodes, nextNodeId);

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

function timeOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
	return start1 < end2 && start2 < end1;
}

function getEdgeOccupancyTime(
	position: TimedPosition,
	prevPosition: TimedPosition | null
): { startTime: number; endTime: number } | null {
	if (!prevPosition || !position.edgeId) return null;
	return {
		startTime: prevPosition.departureTime,
		endTime: position.arrivalTime
	};
}

function getNodeOccupancyTime(position: TimedPosition): { startTime: number; endTime: number } {
	const buffer = 1;
	return {
		startTime: position.arrivalTime - buffer,
		endTime: position.departureTime + buffer
	};
}

export function detectConflicts(
	routes: CartRoute[],
	edges: MineEdge[],
	carts: Cart[]
): Conflict[] {
	const conflicts: Conflict[] = [];
	const cartMap = new Map(carts.map((c) => [c.id, c]));

	for (let i = 0; i < routes.length; i++) {
		for (let j = i + 1; j < routes.length; j++) {
			const route1 = routes[i];
			const route2 = routes[j];

			if (!route1.hasPath || !route2.hasPath) continue;

			const cart1 = cartMap.get(route1.cartId);
			const cart2 = cartMap.get(route2.cartId);
			if (!cart1 || !cart2) continue;

			detectEdgeConflicts(route1, route2, edges, cart1, cart2, conflicts);
			detectNodeConflicts(route1, route2, cart1, cart2, conflicts);
			detectSwitchConflicts(route1, route2, cart1, cart2, conflicts);
		}
	}

	return conflicts;
}

function detectEdgeConflicts(
	route1: CartRoute,
	route2: CartRoute,
	edges: MineEdge[],
	cart1: Cart,
	cart2: Cart,
	conflicts: Conflict[]
) {
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
					const edge = getEdgeById(edges, pos1.edgeId);
					const duration = Math.min(occupancy1.endTime, occupancy2.endTime) -
						Math.max(occupancy1.startTime, occupancy2.startTime);
					const severity = duration > 10 ? 'high' : duration > 5 ? 'medium' : 'low';

					conflicts.push({
						id: createConflictId(),
						type: 'edge',
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

function detectNodeConflicts(
	route1: CartRoute,
	route2: CartRoute,
	cart1: Cart,
	cart2: Cart,
	conflicts: Conflict[]
) {
	for (const pos1 of route1.positions) {
		const occupancy1 = getNodeOccupancyTime(pos1);

		for (const pos2 of route2.positions) {
			if (pos1.nodeId === pos2.nodeId) {
				const occupancy2 = getNodeOccupancyTime(pos2);

				if (timeOverlap(occupancy1.startTime, occupancy1.endTime, occupancy2.startTime, occupancy2.endTime)) {
					const isSameStart = pos1.nodeId === cart1.sourceId && pos1.nodeId === cart2.sourceId;
					const isSameEnd = pos1.nodeId === cart1.targetId && pos1.nodeId === cart2.targetId;

					if (!isSameStart && !isSameEnd) {
						const duration = Math.min(occupancy1.endTime, occupancy2.endTime) -
							Math.max(occupancy1.startTime, occupancy2.startTime);
						const severity = duration > 8 ? 'high' : duration > 4 ? 'medium' : 'low';

						conflicts.push({
							id: createConflictId(),
							type: 'node',
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

function detectSwitchConflicts(
	route1: CartRoute,
	route2: CartRoute,
	cart1: Cart,
	cart2: Cart,
	conflicts: Conflict[]
) {
	for (const pos1 of route1.positions) {
		if (!pos1.isSwitch) continue;
		const occupancy1 = getNodeOccupancyTime(pos1);

		for (const pos2 of route2.positions) {
			if (!pos2.isSwitch) continue;
			if (pos1.nodeId !== pos2.nodeId) continue;

			const occupancy2 = getNodeOccupancyTime(pos2);

			if (timeOverlap(occupancy1.startTime, occupancy1.endTime, occupancy2.startTime, occupancy2.endTime)) {
				const duration = Math.min(occupancy1.endTime, occupancy2.endTime) -
					Math.max(occupancy1.startTime, occupancy2.startTime);
				const severity = 'high';

				const existingConflict = conflicts.find(
					(c) => c.type === 'node' && c.nodeId === pos1.nodeId &&
						((c.cart1Id === cart1.id && c.cart2Id === cart2.id) ||
							(c.cart1Id === cart2.id && c.cart2Id === cart1.id))
				);

				if (!existingConflict) {
					conflicts.push({
						id: createConflictId(),
						type: 'switch',
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

export function resolveConflictsWithPriority(
	routes: CartRoute[],
	conflicts: Conflict[],
	carts: Cart[],
	nodes: MineNode[],
	edges: MineEdge[]
): { routes: CartRoute[]; conflicts: Conflict[]; resolved: boolean } {
	const cartMap = new Map(carts.map((c) => [c.id, c]));
	const routeMap = new Map(routes.map((r) => [r.cartId, { ...r, positions: [...r.positions] }]));
	let unresolvedConflicts = [...conflicts];
	let resolved = true;
	const maxIterations = 20;

	for (let iteration = 0; iteration < maxIterations && unresolvedConflicts.length > 0; iteration++) {
		const newConflicts: Conflict[] = [];

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

			let totalWaitTime = waitTime;
			if (iteration > 0) {
				const firstPos = lowerRoute.positions[0];
				if (firstPos) {
					totalWaitTime = firstPos.departureTime - originalDeparture + waitTime;
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
		newConflicts.push(...detectConflicts(updatedRoutes, edges, carts));

		if (newConflicts.length === 0) {
			unresolvedConflicts = [];
			break;
		} else if (newConflicts.length < unresolvedConflicts.length) {
			unresolvedConflicts = newConflicts;
		} else {
			resolved = false;
			break;
		}
	}

	return {
		routes: Array.from(routeMap.values()),
		conflicts: unresolvedConflicts,
		resolved: unresolvedConflicts.length === 0
	};
}

interface TimeWindow {
	start: number;
	end: number;
	cartId: string;
}

interface OccupancyTable {
	edgeOccupancies: Map<string, TimeWindow[]>;
	nodeOccupancies: Map<string, TimeWindow[]>;
}

function createOccupancyTable(): OccupancyTable {
	return {
		edgeOccupancies: new Map(),
		nodeOccupancies: new Map()
	};
}

function addEdgeOccupancy(table: OccupancyTable, edgeId: string, start: number, end: number, cartId: string) {
	if (!table.edgeOccupancies.has(edgeId)) {
		table.edgeOccupancies.set(edgeId, []);
	}
	table.edgeOccupancies.get(edgeId)!.push({ start, end, cartId });
	table.edgeOccupancies.get(edgeId)!.sort((a, b) => a.start - b.start);
}

function addNodeOccupancy(table: OccupancyTable, nodeId: string, start: number, end: number, cartId: string) {
	if (!table.nodeOccupancies.has(nodeId)) {
		table.nodeOccupancies.set(nodeId, []);
	}
	table.nodeOccupancies.get(nodeId)!.push({ start, end, cartId });
	table.nodeOccupancies.get(nodeId)!.sort((a, b) => a.start - b.start);
}

function findEarliestAvailableTime(
	occupancies: TimeWindow[] | undefined,
	desiredStart: number,
	duration: number,
	buffer: number = 0.5
): number {
	if (!occupancies || occupancies.length === 0) {
		return desiredStart;
	}

	let earliestStart = desiredStart;

	for (const occ of occupancies) {
		const occStart = occ.start - buffer;
		const occEnd = occ.end + buffer;

		if (earliestStart + duration <= occStart) {
			return earliestStart;
		}

		if (earliestStart < occEnd) {
			earliestStart = occEnd;
		}
	}

	return earliestStart;
}

function buildAdjacencyList(
	nodes: MineNode[],
	edges: MineEdge[]
): Map<string, { nodeId: string; edgeId: string; length: number; isSwitch: boolean }[]> {
	const adjacency = new Map<string, { nodeId: string; edgeId: string; length: number; isSwitch: boolean }[]>();
	nodes.forEach((n) => adjacency.set(n.id, []));

	edges.forEach((edge) => {
		if (!edge.enabled) return;
		if (edge.isSwitch && !edge.switchActive) return;

		const sourceNode = nodes.find((n) => n.id === edge.source);
		const targetNode = nodes.find((n) => n.id === edge.target);
		if (!sourceNode || !targetNode) return;
		if (sourceNode.blocked || targetNode.blocked) return;

		adjacency.get(edge.source)?.push({
			nodeId: edge.target,
			edgeId: edge.id,
			length: edge.length,
			isSwitch: edge.isSwitch
		});
		adjacency.get(edge.target)?.push({
			nodeId: edge.source,
			edgeId: edge.id,
			length: edge.length,
			isSwitch: edge.isSwitch
		});
	});

	return adjacency;
}

interface PathState {
	nodeId: string;
	arrivalTime: number;
	departureTime: number;
	distance: number;
	switchCount: number;
	previousNode: string | null;
	previousEdge: string | null;
}

function findTimeWindowPath(
	nodes: MineNode[],
	edges: MineEdge[],
	cart: Cart,
	occupancyTable: OccupancyTable
): CartRoute {
	const adjacency = buildAdjacencyList(nodes, edges);
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));

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

function addRouteToOccupancyTable(
	table: OccupancyTable,
	route: CartRoute,
	cartId: string
) {
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

export function calculateDispatch(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[]
): DispatchResult {
	const sortedCarts = [...carts].sort((a, b) => b.priority - a.priority);
	const occupancyTable = createOccupancyTable();
	const routes: CartRoute[] = [];

	for (const cart of sortedCarts) {
		const route = findTimeWindowPath(nodes, edges, cart, occupancyTable);
		routes.push(route);

		if (route.hasPath) {
			addRouteToOccupancyTable(occupancyTable, route, cart.id);
		}
	}

	const finalRoutes = carts.map((cart) => {
		const route = routes.find((r) => r.cartId === cart.id);
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

	const conflicts = detectConflicts(finalRoutes, edges, carts);

	const totalTime = Math.max(...finalRoutes.map((r) => r.positions.length > 0
		? r.positions[r.positions.length - 1].arrivalTime
		: 0));
	const totalDistance = finalRoutes.reduce((sum, r) => sum + r.totalDistance, 0);
	const totalSwitchCount = finalRoutes.reduce((sum, r) => sum + r.switchCount, 0);
	const totalWaitTime = finalRoutes.reduce((sum, r) => sum + r.waitTime, 0);

	const highConflicts = conflicts.filter((c) => c.severity === 'high').length;
	const mediumConflicts = conflicts.filter((c) => c.severity === 'medium').length;
	const lowConflicts = conflicts.filter((c) => c.severity === 'low').length;
	const baseRisk = highConflicts * 30 + mediumConflicts * 15 + lowConflicts * 5;
	const waitRisk = totalWaitTime > 0 ? Math.min(20, totalWaitTime / 2) : 0;
	const congestionRisk = Math.min(100, baseRisk + waitRisk);

	const hasAllPaths = finalRoutes.every((r) => r.hasPath);

	return {
		routes: finalRoutes,
		conflicts,
		totalTime,
		totalDistance,
		totalSwitchCount,
		congestionRisk,
		hasAllPaths
	};
}

export function generatePlaybackFrames(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	dispatchResult: DispatchResult,
	frameInterval: number = 0.5
): PlaybackFrame[] {
	const frames: PlaybackFrame[] = [];
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const edgeMap = new Map(edges.map((e) => [e.id, e]));
	const cartMap = new Map(carts.map((c) => [c.id, c]));
	const triggeredEvents = new Set<string>();

	if (dispatchResult.routes.length === 0) return frames;

	const maxTime = Math.max(
		...dispatchResult.routes.map((r) =>
			r.positions.length > 0 ? r.positions[r.positions.length - 1].departureTime : 0
		)
	);

	if (!isFinite(maxTime) || maxTime <= 0) return frames;

	for (let time = 0; time <= maxTime + frameInterval; time += frameInterval) {
		const cartStates: PlaybackFrame['cartStates'] = [];
		const congestedEdges: Map<string, number> = new Map();
		const events: PlaybackEvent[] = [];

		for (const route of dispatchResult.routes) {
			const cart = cartMap.get(route.cartId);
			if (!cart || !route.hasPath || route.positions.length === 0) continue;

			let isWaiting = false;
			let waitRemaining = 0;
			let waitNodeLabel = '';
			let x = 0;
			let y = 0;
			let currentNodeId = '';
			let nextNodeId: string | null = null;
			let progress = 0;

			const positions = route.positions;

			if (time < positions[0].arrivalTime) {
				const node = nodeMap.get(positions[0].nodeId);
				if (node) {
					x = node.x;
					y = node.y;
					currentNodeId = node.id;
					isWaiting = true;
					waitRemaining = positions[0].arrivalTime - time;
					waitNodeLabel = node.label;
				}
			} else {
				let found = false;
				for (let i = 0; i < positions.length; i++) {
					const pos = positions[i];

					if (time >= pos.arrivalTime && time < pos.departureTime) {
						const node = nodeMap.get(pos.nodeId);
						if (node) {
							x = node.x;
							y = node.y;
							currentNodeId = node.id;
							isWaiting = true;
							waitRemaining = pos.departureTime - time;
							waitNodeLabel = node.label;
						}
						if (i < positions.length - 1) {
							nextNodeId = positions[i + 1].nodeId;
						}
						progress = 0;
						found = true;

						const eventKey = `wait_start_${cart.id}_${i}`;
						if (!triggeredEvents.has(eventKey) && time >= pos.arrivalTime && time < pos.arrivalTime + frameInterval) {
							triggeredEvents.add(eventKey);
							events.push({
								time,
								type: 'wait',
								cartId: cart.id,
								cartName: cart.name,
								description: `${cart.name} 在节点 ${node?.label || pos.nodeId.slice(0, 8)} 等待 ${waitRemaining.toFixed(1)} 单位时间`
							});
						}
						break;
					}

					if (i < positions.length - 1) {
						const nextPos = positions[i + 1];
						if (time >= pos.departureTime && time <= nextPos.arrivalTime) {
							const currNode = nodeMap.get(pos.nodeId);
							const nextNode = nodeMap.get(nextPos.nodeId);
							if (currNode && nextNode) {
								const segmentDuration = nextPos.arrivalTime - pos.departureTime;
								progress = segmentDuration > 0
									? (time - pos.departureTime) / segmentDuration
									: 0;
								progress = Math.max(0, Math.min(1, progress));

								x = currNode.x + (nextNode.x - currNode.x) * progress;
								y = currNode.y + (nextNode.y - currNode.y) * progress;
								currentNodeId = pos.nodeId;
								nextNodeId = nextPos.nodeId;
								isWaiting = false;
								waitRemaining = 0;
							}

							if (nextPos.edgeId) {
								const currentCount = congestedEdges.get(nextPos.edgeId) || 0;
								congestedEdges.set(nextPos.edgeId, currentCount + 1);
							}
							found = true;
							break;
						}
					}
				}

				if (!found) {
					const lastPos = positions[positions.length - 1];
					const lastNode = nodeMap.get(lastPos.nodeId);
					if (lastNode) {
						x = lastNode.x;
						y = lastNode.y;
						currentNodeId = lastPos.nodeId;
						nextNodeId = null;
						progress = 1;
						isWaiting = false;
					}
				}
			}

			const departEventKey = `depart_${cart.id}`;
			if (time >= positions[0].departureTime && time < positions[0].departureTime + frameInterval && !triggeredEvents.has(departEventKey)) {
				triggeredEvents.add(departEventKey);
				events.push({
					time,
					type: 'depart',
					cartId: cart.id,
					cartName: cart.name,
					description: `${cart.name} 从起点出发`
				});
			}

			for (let i = 1; i < positions.length; i++) {
				const pos = positions[i];
				const arriveEventKey = `arrive_${cart.id}_${i}`;
				if (time >= pos.arrivalTime && time < pos.arrivalTime + frameInterval && !triggeredEvents.has(arriveEventKey)) {
					triggeredEvents.add(arriveEventKey);
					const node = nodeMap.get(pos.nodeId);
					events.push({
						time,
						type: 'arrive',
						cartId: cart.id,
						cartName: cart.name,
						description: `${cart.name} 到达节点 ${node?.label || pos.nodeId.slice(0, 8)}`
					});
					if (pos.isSwitch) {
						events.push({
							time,
							type: 'switch',
							cartId: cart.id,
							cartName: cart.name,
							description: `${cart.name} 经过岔道节点`
						});
					}
				}
			}

			cartStates.push({
				cartId: cart.id,
				cartName: cart.name,
				x,
				y,
				currentNodeId,
				nextNodeId,
				progress,
				isWaiting,
				waitRemaining,
				waitNodeLabel,
				color: cart.color
			});
		}

		for (const conflict of dispatchResult.conflicts) {
			const conflictEventKey = `conflict_${conflict.id}`;
			if (time >= conflict.startTime && time < conflict.startTime + frameInterval && !triggeredEvents.has(conflictEventKey)) {
				triggeredEvents.add(conflictEventKey);
				events.push({
					time,
					type: 'conflict',
					cartId: conflict.cart1Id,
					cartName: conflict.cart1Name,
					description: `⚠ ${conflict.description}`
				});
			}
		}

		const congestedEdgesList = Array.from(congestedEdges.entries())
			.filter(([, count]) => count > 1)
			.map(([edgeId, count]) => ({ edgeId, level: count }));

		frames.push({
			time,
			cartStates,
			congestedEdges: congestedEdgesList,
			events
		});
	}

	return frames;
}

export function getDefaultCarts(loadingNodeId: string, unloadingNodeId: string): Cart[] {
	return [
		{
			id: createCartId(),
			name: '1号矿车',
			sourceId: loadingNodeId,
			targetId: unloadingNodeId,
			departureTime: 0,
			priority: 3,
			speed: 10,
			color: '#ef4444'
		},
		{
			id: createCartId(),
			name: '2号矿车',
			sourceId: loadingNodeId,
			targetId: unloadingNodeId,
			departureTime: 5,
			priority: 2,
			speed: 10,
			color: '#3b82f6'
		},
		{
			id: createCartId(),
			name: '3号矿车',
			sourceId: loadingNodeId,
			targetId: unloadingNodeId,
			departureTime: 10,
			priority: 1,
			speed: 8,
			color: '#22c55e'
		}
	];
}

export function createNewCart(loadingNodeId: string, unloadingNodeId: string, index: number): Cart {
	const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
	return {
		id: createCartId(),
		name: `${index + 1}号矿车`,
		sourceId: loadingNodeId,
		targetId: unloadingNodeId,
		departureTime: index * 5,
		priority: Math.max(1, 3 - index),
		speed: 10,
		color: colors[index % colors.length]
	};
}
