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

export function calculateDispatch(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[]
): DispatchResult {
	const sortedCarts = [...carts].sort((a, b) => b.priority - a.priority);

	const routes: CartRoute[] = sortedCarts.map((cart) =>
		buildTimedRoute(nodes, edges, cart)
	);

	const initialConflicts = detectConflicts(routes, edges, carts);

	const { routes: resolvedRoutes, conflicts: remainingConflicts } = resolveConflictsWithPriority(
		routes,
		initialConflicts,
		carts,
		nodes,
		edges
	);

	const finalRoutes = carts.map((cart) => {
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

	const totalTime = Math.max(...finalRoutes.map((r) => r.positions.length > 0
		? r.positions[r.positions.length - 1].arrivalTime
		: 0));
	const totalDistance = finalRoutes.reduce((sum, r) => sum + r.totalDistance, 0);
	const totalSwitchCount = finalRoutes.reduce((sum, r) => sum + r.switchCount, 0);

	const highConflicts = remainingConflicts.filter((c) => c.severity === 'high').length;
	const mediumConflicts = remainingConflicts.filter((c) => c.severity === 'medium').length;
	const lowConflicts = remainingConflicts.filter((c) => c.severity === 'low').length;
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

export function generatePlaybackFrames(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	dispatchResult: DispatchResult,
	frameInterval: number = 1
): PlaybackFrame[] {
	const frames: PlaybackFrame[] = [];
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const edgeMap = new Map(edges.map((e) => [e.id, e]));
	const cartMap = new Map(carts.map((c) => [c.id, c]));

	if (dispatchResult.routes.length === 0) return frames;

	const maxTime = Math.max(
		...dispatchResult.routes.map((r) =>
			r.positions.length > 0 ? r.positions[r.positions.length - 1].arrivalTime : 0
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

			let currentIdx = 0;
			let progress = 0;
			let isWaiting = false;

			if (time < route.positions[0].departureTime) {
				const startNode = nodeMap.get(route.positions[0].nodeId);
				if (startNode) {
					cartStates.push({
						cartId: cart.id,
						cartName: cart.name,
						x: startNode.x,
						y: startNode.y,
						currentNodeId: startNode.id,
						nextNodeId: null,
						progress: 0,
						isWaiting: true,
						color: cart.color
					});
				}
				continue;
			}

			for (let i = 0; i < route.positions.length - 1; i++) {
				const currPos = route.positions[i];
				const nextPos = route.positions[i + 1];

				if (time >= currPos.departureTime && time <= nextPos.arrivalTime) {
					currentIdx = i;
					const segmentDuration = nextPos.arrivalTime - currPos.departureTime;
					progress = segmentDuration > 0
						? (time - currPos.departureTime) / segmentDuration
						: 0;
					progress = Math.max(0, Math.min(1, progress));

					const edgeId = nextPos.edgeId;
					if (edgeId) {
						const currentCount = congestedEdges.get(edgeId) || 0;
						congestedEdges.set(edgeId, currentCount + 1);
					}
					break;
				} else if (time > nextPos.arrivalTime) {
					currentIdx = i + 1;
					progress = 1;
				}
			}

			const currentPos = route.positions[Math.min(currentIdx, route.positions.length - 1)];
			const nextPos = route.positions[currentIdx + 1];
			const currNode = nodeMap.get(currentPos.nodeId);

			let x = currNode?.x || 0;
			let y = currNode?.y || 0;

			if (nextPos && progress < 1) {
				const nextNode = nodeMap.get(nextPos.nodeId);
				if (nextNode) {
					x = currNode!.x + (nextNode.x - currNode!.x) * progress;
					y = currNode!.y + (nextNode.y - currNode!.y) * progress;
				}
			}

			if (Math.abs(time - currentPos.departureTime) < frameInterval / 2 && currentIdx === 0) {
				events.push({
					time,
					type: 'depart',
					cartId: cart.id,
					cartName: cart.name,
					description: `${cart.name} 从起点出发`
				});
			}

			if (nextPos && Math.abs(time - nextPos.arrivalTime) < frameInterval / 2) {
				events.push({
					time,
					type: 'arrive',
					cartId: cart.id,
					cartName: cart.name,
					description: `${cart.name} 到达节点 ${nextPos.nodeId.slice(0, 8)}`
				});
				if (nextPos.isSwitch) {
					events.push({
						time,
						type: 'switch',
						cartId: cart.id,
						cartName: cart.name,
						description: `${cart.name} 经过岔道节点`
					});
				}
			}

			cartStates.push({
				cartId: cart.id,
				cartName: cart.name,
				x,
				y,
				currentNodeId: currentPos.nodeId,
				nextNodeId: nextPos?.nodeId || null,
				progress,
				isWaiting,
				color: cart.color
			});
		}

		for (const conflict of dispatchResult.conflicts) {
			if (Math.abs(time - conflict.startTime) < frameInterval / 2) {
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
