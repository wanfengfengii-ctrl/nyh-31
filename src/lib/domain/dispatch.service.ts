// ============================================================================
//  调度推演服务 (Dispatch Service)
// ============================================================================
//  提供多车调度、冲突检测、冲突解决等核心调度功能
// ============================================================================

import type {
	MineNode,
	MineEdge,
	Cart,
	CartRoute,
	TimedPosition,
	Conflict,
	DispatchResult,
	OccupancyTable
} from './models';
import {
	buildNodeMap,
	getEdgeById,
	createOccupancyTable,
	timeOverlap
} from './network.service';
import {
	findTimeWindowPath,
	addRouteToOccupancyTable,
	createEmptyRoute
} from './pathfinding.service';

// ============================================================================
//  ID 生成
// ============================================================================

function createConflictId(): string {
	return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createCartId(): string {
	return `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
//  冲突检测
// ============================================================================

/**
 * 获取边的占用时间区间
 */
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

/**
 * 获取节点的占用时间区间（带缓冲）
 */
function getNodeOccupancyTime(position: TimedPosition): { startTime: number; endTime: number } {
	const buffer = 1;
	return {
		startTime: position.arrivalTime - buffer,
		endTime: position.departureTime + buffer
	};
}

/**
 * 检测所有路线之间的冲突
 */
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

/**
 * 检测轨道冲突
 */
function detectEdgeConflicts(
	route1: CartRoute,
	route2: CartRoute,
	edges: MineEdge[],
	cart1: Cart,
	cart2: Cart,
	conflicts: Conflict[]
): void {
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
				if (timeOverlap(
					occupancy1.startTime, occupancy1.endTime,
					occupancy2.startTime, occupancy2.endTime
				)) {
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

/**
 * 检测节点冲突
 */
function detectNodeConflicts(
	route1: CartRoute,
	route2: CartRoute,
	cart1: Cart,
	cart2: Cart,
	conflicts: Conflict[]
): void {
	for (const pos1 of route1.positions) {
		const occupancy1 = getNodeOccupancyTime(pos1);

		for (const pos2 of route2.positions) {
			if (pos1.nodeId === pos2.nodeId) {
				const occupancy2 = getNodeOccupancyTime(pos2);

				if (timeOverlap(
					occupancy1.startTime, occupancy1.endTime,
					occupancy2.startTime, occupancy2.endTime
				)) {
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

/**
 * 检测道岔冲突
 */
function detectSwitchConflicts(
	route1: CartRoute,
	route2: CartRoute,
	cart1: Cart,
	cart2: Cart,
	conflicts: Conflict[]
): void {
	for (const pos1 of route1.positions) {
		if (!pos1.isSwitch) continue;
		const occupancy1 = getNodeOccupancyTime(pos1);

		for (const pos2 of route2.positions) {
			if (!pos2.isSwitch) continue;
			if (pos1.nodeId !== pos2.nodeId) continue;

			const occupancy2 = getNodeOccupancyTime(pos2);

			if (timeOverlap(
				occupancy1.startTime, occupancy1.endTime,
				occupancy2.startTime, occupancy2.endTime
			)) {
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

// ============================================================================
//  冲突解决 (基于优先级的等待策略)
// ============================================================================

/**
 * 通过优先级解决冲突
 * 低优先级车辆等待高优先级车辆通过
 */
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

// ============================================================================
//  整体调度计算
// ============================================================================

/**
 * 计算多车调度方案
 * 按优先级排序，依次为每辆车规划考虑时间窗的路径
 */
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
		return route || createEmptyRoute(cart);
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

// ============================================================================
//  默认小车配置
// ============================================================================

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

export function createNewCart(
	loadingNodeId: string,
	unloadingNodeId: string,
	index: number
): Cart {
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
