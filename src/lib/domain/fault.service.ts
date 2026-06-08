// ============================================================================
//  故障管理服务 (Fault Service)
// ============================================================================
//  提供故障相关的核心领域服务：
//    - 故障应用到网络（applyFaultsToNetwork）
//    - 故障影响评估（assessFaultImpact）
//    - 维修优先级计算（calculateRepairPriorities）
//    - 应急绕行方案（generateEmergencyDetour）
//    - 场景对比分析（compareFaultScenarios / calculateEnhancedComparison）
// ============================================================================

import type {
	MineNode,
	MineEdge,
	Cart,
	Fault,
	FaultType,
	FaultSeverity,
	FaultTargetType,
	FaultStatus,
	AffectedCart,
	FaultImpactResult,
	RepairPriorityItem,
	FaultComparisonResult,
	DispatchResult,
	CartRoute,
	PathResult,
	WaitStrategy,
	DetourPlan,
	EmergencyDetourResult,
	PhaseComparisonData,
	EnhancedComparisonResult
} from './models';
import { buildNodeMap } from './network.service';
import { calculateShortestPath, buildTimedRoute } from './pathfinding.service';
import { calculateDispatch } from './dispatch.service';

// ============================================================================
//  故障类型定义
// ============================================================================

export const defaultFaultTypes: FaultType[] = [
	{
		id: 'ft_track_broken',
		name: '轨道断裂',
		description: '轨道结构断裂，无法通行',
		severity: 'critical',
		defaultRepairTime: 30
	},
	{
		id: 'ft_track_deformed',
		name: '轨道变形',
		description: '轨道变形，需减速通过',
		severity: 'major',
		defaultRepairTime: 15
	},
	{
		id: 'ft_switch_failure',
		name: '道岔故障',
		description: '道岔无法切换，固定在当前位置',
		severity: 'critical',
		defaultRepairTime: 25
	},
	{
		id: 'ft_switch_jammed',
		name: '道岔卡滞',
		description: '道岔切换不灵活，切换时间延长',
		severity: 'major',
		defaultRepairTime: 10
	},
	{
		id: 'ft_loading_malfunction',
		name: '装载点故障',
		description: '装载设备故障，无法装载矿石',
		severity: 'critical',
		defaultRepairTime: 40
	},
	{
		id: 'ft_loading_slow',
		name: '装载效率下降',
		description: '装载设备老化，装载时间增加',
		severity: 'minor',
		defaultRepairTime: 8
	},
	{
		id: 'ft_unloading_malfunction',
		name: '卸载点故障',
		description: '卸载设备故障，无法卸载矿石',
		severity: 'critical',
		defaultRepairTime: 35
	},
	{
		id: 'ft_unloading_slow',
		name: '卸载效率下降',
		description: '卸载设备老化，卸载时间增加',
		severity: 'minor',
		defaultRepairTime: 6
	},
	{
		id: 'ft_signal_failure',
		name: '信号灯故障',
		description: '信号灯失灵，需人工确认安全',
		severity: 'major',
		defaultRepairTime: 12
	}
];

export function getFaultTypesByTarget(
	targetType: FaultTargetType,
	nodeType?: string
): FaultType[] {
	if (targetType === 'edge') {
		return defaultFaultTypes.filter((ft) =>
			['ft_track_broken', 'ft_track_deformed', 'ft_signal_failure'].includes(ft.id)
		);
	}

	switch (nodeType) {
		case 'loading':
			return defaultFaultTypes.filter((ft) =>
				['ft_loading_malfunction', 'ft_loading_slow', 'ft_signal_failure'].includes(ft.id)
			);
		case 'unloading':
			return defaultFaultTypes.filter((ft) =>
				['ft_unloading_malfunction', 'ft_unloading_slow', 'ft_signal_failure'].includes(ft.id)
			);
		case 'switch':
			return defaultFaultTypes.filter((ft) =>
				['ft_switch_failure', 'ft_switch_jammed', 'ft_signal_failure'].includes(ft.id)
			);
		default:
			return defaultFaultTypes.filter((ft) =>
				['ft_signal_failure', 'ft_track_deformed'].includes(ft.id)
			);
	}
}

// ============================================================================
//  故障创建与优先级
// ============================================================================

function createFaultId(): string {
	return `fault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateFaultPriority(severity: FaultSeverity, impactScope: number): number {
	let basePriority = 0;
	switch (severity) {
		case 'critical':
			basePriority = 100;
			break;
		case 'major':
			basePriority = 60;
			break;
		case 'minor':
			basePriority = 30;
			break;
	}
	return basePriority + impactScope * 10;
}

export function createFault(
	targetType: FaultTargetType,
	targetId: string,
	targetLabel: string,
	faultType: FaultType,
	occurrenceTime: number = 0,
	customRepairDuration?: number,
	impactScope: number = 1
): Fault {
	const priority = calculateFaultPriority(faultType.severity, impactScope);

	return {
		id: createFaultId(),
		targetType,
		targetId,
		targetLabel,
		faultTypeId: faultType.id,
		faultTypeName: faultType.name,
		description: faultType.description,
		severity: faultType.severity,
		occurrenceTime,
		repairDuration: customRepairDuration ?? faultType.defaultRepairTime,
		repairStartTime: null,
		impactScope,
		status: 'pending',
		priority
	};
}

// ============================================================================
//  故障应用到网络
// ============================================================================

/**
 * 将故障应用到网络，返回修改后的节点和轨道
 * @param currentTime 当前时间，用于判断故障是否生效（Infinity 表示全部生效）
 */
export function applyFaultsToNetwork(
	nodes: MineNode[],
	edges: MineEdge[],
	faults: Fault[],
	currentTime: number = Infinity
): { nodes: MineNode[]; edges: MineEdge[] } {
	const modifiedNodes = [...nodes];
	const modifiedEdges = [...edges];

	const activeFaults = faults.filter((f) => {
		if (f.status === 'resolved') return false;
		if (f.occurrenceTime > currentTime) return false;
		if (f.repairStartTime !== null && f.repairStartTime + f.repairDuration <= currentTime)
			return false;
		return true;
	});

	activeFaults.forEach((fault) => {
		if (fault.severity === 'critical' || fault.severity === 'major') {
			if (fault.targetType === 'node') {
				const nodeIdx = modifiedNodes.findIndex((n) => n.id === fault.targetId);
				if (nodeIdx !== -1) {
					modifiedNodes[nodeIdx] = { ...modifiedNodes[nodeIdx], blocked: true };
				}

				if (fault.impactScope > 0) {
					expandImpactToNeighbors(
						fault.targetId,
						modifiedNodes,
						modifiedEdges,
						fault.impactScope,
						fault.severity
					);
				}
			} else if (fault.targetType === 'edge') {
				const edgeIdx = modifiedEdges.findIndex((e) => e.id === fault.targetId);
				if (edgeIdx !== -1) {
					modifiedEdges[edgeIdx] = { ...modifiedEdges[edgeIdx], enabled: false };
				}
			}
		} else if (fault.severity === 'minor') {
			if (fault.targetType === 'edge') {
				const edgeIdx = modifiedEdges.findIndex((e) => e.id === fault.targetId);
				if (edgeIdx !== -1) {
					modifiedEdges[edgeIdx] = {
						...modifiedEdges[edgeIdx],
						length: modifiedEdges[edgeIdx].length * 1.5
					};
				}
			}
		}
	});

	return { nodes: modifiedNodes, edges: modifiedEdges };
}

/**
 * 故障影响范围扩散到相邻节点
 */
function expandImpactToNeighbors(
	nodeId: string,
	nodes: MineNode[],
	edges: MineEdge[],
	depth: number,
	severity: FaultSeverity
): void {
	if (depth <= 0) return;

	const visited = new Set<string>();
	let currentLevel = [nodeId];

	for (let d = 0; d < depth && currentLevel.length > 0; d++) {
		const nextLevel: string[] = [];

		for (const currentNodeId of currentLevel) {
			if (visited.has(currentNodeId)) continue;
			visited.add(currentNodeId);

			const adjacentEdges = edges.filter(
				(e) => e.source === currentNodeId || e.target === currentNodeId
			);

			for (const edge of adjacentEdges) {
				const neighborId =
					edge.source === currentNodeId ? edge.target : edge.source;

				if (!visited.has(neighborId)) {
					nextLevel.push(neighborId);

					if (d === 0 || severity === 'critical') {
						const nodeIdx = nodes.findIndex((n) => n.id === neighborId);
						if (nodeIdx !== -1 && !nodes[nodeIdx].blocked) {
							nodes[nodeIdx] = { ...nodes[nodeIdx], blocked: true };
						}
					}
				}
			}
		}

		currentLevel = nextLevel;
	}
}

// ============================================================================
//  故障影响评估
// ============================================================================

/**
 * 评估单个故障对所有小车的影响
 */
export function assessFaultImpact(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	fault: Fault
): FaultImpactResult {
	const originalRoutes: Map<string, CartRoute> = new Map();
	carts.forEach((cart) => {
		const route = buildTimedRoute(nodes, edges, cart);
		originalRoutes.set(cart.id, route);
	});

	const { nodes: faultNodes, edges: faultEdges } = applyFaultsToNetwork(
		nodes,
		edges,
		[fault],
		fault.occurrenceTime
	);

	const affectedCarts: AffectedCart[] = [];

	carts.forEach((cart) => {
		const originalRoute = originalRoutes.get(cart.id);
		if (!originalRoute || !originalRoute.hasPath) return;

		const faultRoute = buildTimedRoute(faultNodes, faultEdges, cart);

		const isAffected =
			!faultRoute.hasPath ||
			faultRoute.totalTime > originalRoute.totalTime * 1.05 ||
			faultRoute.totalDistance > originalRoute.totalDistance * 1.05;

		if (isAffected) {
			const alternativePathResult = calculateShortestPath(
				faultNodes,
				faultEdges,
				cart.sourceId,
				cart.targetId
			);

			let impactLevel: 'high' | 'medium' | 'low';
			const delayTime = faultRoute.hasPath
				? faultRoute.totalTime - originalRoute.totalTime
				: Infinity;

			if (!faultRoute.hasPath) {
				impactLevel = 'high';
			} else if (delayTime > originalRoute.totalTime * 0.5) {
				impactLevel = 'high';
			} else if (delayTime > originalRoute.totalTime * 0.2) {
				impactLevel = 'medium';
			} else {
				impactLevel = 'low';
			}

			affectedCarts.push({
				cartId: cart.id,
				cartName: cart.name,
				cartColor: cart.color,
				originalRoute: originalRoute.positions.map((p) => p.nodeId),
				alternativeRoute: alternativePathResult.hasPath ? alternativePathResult.nodes : null,
				delayTime: isFinite(delayTime) ? delayTime : -1,
				originalTotalTime: originalRoute.totalTime,
				newTotalTime: faultRoute.hasPath ? faultRoute.totalTime : -1,
				hasAlternative: alternativePathResult.hasPath,
				impactLevel
			});
		}
	});

	const totalDelayTime = affectedCarts.reduce((sum, ac) => {
		return sum + (ac.delayTime > 0 ? ac.delayTime : 0);
	}, 0);
	const hasUnreachableCarts = affectedCarts.some((ac) => !ac.hasAlternative);
	const alternativeRoutesAvailable = affectedCarts.some((ac) => ac.hasAlternative);

	return {
		faultId: fault.id,
		faultName: fault.faultTypeName,
		affectedCarts,
		totalAffectedCount: affectedCarts.length,
		totalDelayTime,
		hasUnreachableCarts,
		alternativeRoutesAvailable
	};
}

/**
 * 评估多个故障的影响
 */
export function assessMultipleFaultsImpact(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): FaultImpactResult[] {
	return faults.map((fault) => assessFaultImpact(nodes, edges, carts, fault));
}

// ============================================================================
//  维修优先级计算
// ============================================================================

export function calculateRepairPriorities(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): RepairPriorityItem[] {
	const impactResults = assessMultipleFaultsImpact(nodes, edges, carts, faults);

	const priorityItems: RepairPriorityItem[] = faults.map((fault) => {
		const impact = impactResults.find((ir) => ir.faultId === fault.id);

		const impactScore = impact
			? impact.totalAffectedCount * 20 +
			  Math.min(impact.totalDelayTime, 100) * 0.5 +
			  (impact.hasUnreachableCarts ? 50 : 0)
			: 0;

		const severityScore =
			fault.severity === 'critical' ? 100 : fault.severity === 'major' ? 60 : 30;

		const totalPriority = severityScore + impactScore + fault.priority;

		return {
			faultId: fault.id,
			faultName: fault.faultTypeName,
			targetLabel: fault.targetLabel,
			severity: fault.severity,
			priority: totalPriority,
			affectedCartCount: impact?.totalAffectedCount || 0,
			totalDelayTime: impact?.totalDelayTime || 0,
			repairDuration: fault.repairDuration,
			estimatedRecoveryTime: fault.occurrenceTime + fault.repairDuration
		};
	});

	return priorityItems.sort((a, b) => b.priority - a.priority);
}

// ============================================================================
//  故障场景对比
// ============================================================================

export function compareFaultScenarios(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): FaultComparisonResult {
	const beforeFault = calculateDispatch(nodes, edges, carts);

	const { nodes: faultNodes, edges: faultEdges } = applyFaultsToNetwork(
		nodes,
		edges,
		faults,
		Math.max(...faults.map((f) => f.occurrenceTime)) + 1
	);
	const afterFault = calculateDispatch(faultNodes, faultEdges, carts);

	const repairedFaults = faults.map((f) => ({ ...f, status: 'resolved' as const }));
	const { nodes: repairedNodes, edges: repairedEdges } = applyFaultsToNetwork(
		nodes,
		edges,
		repairedFaults,
		Infinity
	);
	const afterRepair = calculateDispatch(repairedNodes, repairedEdges, carts);

	const deltaTotalTime = afterFault.totalTime - beforeFault.totalTime;
	const deltaTotalDistance = afterFault.totalDistance - beforeFault.totalDistance;
	const deltaCongestionRisk = afterFault.congestionRisk - beforeFault.congestionRisk;

	const affectedCartCount = afterFault.routes.filter((r) => {
		const beforeRoute = beforeFault.routes.find((br) => br.cartId === r.cartId);
		if (!beforeRoute) return false;
		if (!r.hasPath && beforeRoute.hasPath) return true;
		if (r.totalTime > beforeRoute.totalTime * 1.1) return true;
		return false;
	}).length;

	return {
		beforeFault,
		afterFault,
		afterRepair,
		deltaTotalTime,
		deltaTotalDistance,
		deltaCongestionRisk,
		affectedCartCount
	};
}

// ============================================================================
//  应急绕行方案
// ============================================================================

/**
 * 为单个故障生成应急绕行方案
 */
export function generateEmergencyDetour(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	fault: Fault
): EmergencyDetourResult {
	const detourPlans: DetourPlan[] = [];
	let totalFeasible = 0;
	let totalDelay = 0;

	const { nodes: faultNodes, edges: faultEdges } = applyFaultsToNetwork(
		nodes,
		edges,
		[fault],
		fault.occurrenceTime
	);

	carts.forEach((cart) => {
		const originalRoute = buildTimedRoute(nodes, edges, cart);
		const faultRoute = buildTimedRoute(faultNodes, faultEdges, cart);

		if (!originalRoute.hasPath) return;

		const isAffected =
			!faultRoute.hasPath ||
			faultRoute.totalTime > originalRoute.totalTime * 1.05;

		if (!isAffected) return;

		const alternativePath = calculateShortestPath(
			faultNodes,
			faultEdges,
			cart.sourceId,
			cart.targetId
		);

		let waitStrategy: WaitStrategy = 'hold_at_node';
		let waitNodeId: string | undefined;
		let waitDuration = 0;
		let feasible = alternativePath.hasPath;
		let reason: string | undefined;

		if (alternativePath.hasPath) {
			const delayTime = alternativePath.totalDistance / cart.speed - originalRoute.totalTime;

			if (delayTime <= 0) {
				waitStrategy = 'reroute_immediately';
			} else if (delayTime > originalRoute.totalTime * 0.3) {
				waitStrategy = 'wait_then_reroute';
				waitNodeId = originalRoute.positions[0]?.nodeId;
				waitDuration = fault.repairDuration * 0.3;
			} else {
				waitStrategy = 'reroute_immediately';
			}

			totalFeasible++;
			totalDelay += Math.max(0, delayTime);
		} else {
			waitStrategy = 'hold_at_node';
			const nearestSafeNode = findNearestSafeNode(
				cart,
				originalRoute,
				fault,
				nodes
			);
			waitNodeId = nearestSafeNode;
			waitDuration = fault.repairDuration;
			feasible = false;
			reason = '无可用替代路线，需等待故障修复';
			totalDelay += fault.repairDuration;
		}

		detourPlans.push({
			cartId: cart.id,
			cartName: cart.name,
			cartColor: cart.color,
			originalRoute: originalRoute.positions.map((p) => p.nodeId),
			detourRoute: alternativePath.hasPath
				? alternativePath.nodes
				: originalRoute.positions.map((p) => p.nodeId),
			originalTotalTime: originalRoute.totalTime,
			detourTotalTime: alternativePath.hasPath
				? alternativePath.totalDistance / cart.speed
				: originalRoute.totalTime + fault.repairDuration,
			delayTime: alternativePath.hasPath
				? Math.max(0, alternativePath.totalDistance / cart.speed - originalRoute.totalTime)
				: fault.repairDuration,
			additionalDistance: alternativePath.hasPath
				? alternativePath.totalDistance - originalRoute.totalDistance
				: 0,
			waitStrategy,
			waitNodeId,
			waitDuration,
			feasible,
			reason
		});
	});

	const recommendation = generateDetourRecommendation(detourPlans, fault);

	return {
		faultId: fault.id,
		faultName: fault.faultTypeName,
		detourPlans,
		totalAffectedCarts: detourPlans.length,
		totalFeasibleDetours: totalFeasible,
		totalDelayEstimate: totalDelay,
		recommendation
	};
}

/**
 * 查找最近的安全节点
 */
function findNearestSafeNode(
	cart: Cart,
	originalRoute: CartRoute,
	fault: Fault,
	nodes: MineNode[]
): string | undefined {
	if (originalRoute.positions.length === 0) return undefined;

	const nodeMap = buildNodeMap(nodes);

	for (const pos of originalRoute.positions) {
		if (fault.targetType === 'node' && pos.nodeId === fault.targetId) {
			break;
		}
		if (fault.targetType === 'edge' && pos.edgeId === fault.targetId) {
			break;
		}
		const node = nodeMap.get(pos.nodeId);
		if (node && !node.blocked) {
			return pos.nodeId;
		}
	}

	return originalRoute.positions[0]?.nodeId;
}

/**
 * 生成绕行建议
 */
function generateDetourRecommendation(
	detourPlans: DetourPlan[],
	fault: Fault
): string {
	const infeasibleCount = detourPlans.filter((d) => !d.feasible).length;
	const highDelayCount = detourPlans.filter((d) => d.delayTime > 20).length;

	if (infeasibleCount > 0) {
		return `紧急：${infeasibleCount} 辆车无替代路线，需优先抢修 ${fault.targetLabel} 处的 ${fault.faultTypeName}`;
	} else if (highDelayCount > 0) {
		return `注意：${highDelayCount} 辆车绕行延误较大，建议协调抢修顺序以减少总等待时间`;
	} else if (detourPlans.length > 0) {
		return `情况可控：所有受影响车辆均有替代路线，建议按正常流程抢修`;
	}
	return '暂无车辆受影响';
}

/**
 * 为所有故障生成应急绕行方案
 */
export function generateAllEmergencyDetours(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): EmergencyDetourResult[] {
	return faults.map((fault) => generateEmergencyDetour(nodes, edges, carts, fault));
}

// ============================================================================
//  增强对比分析
// ============================================================================

export function calculateEnhancedComparison(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): EnhancedComparisonResult {
	const beforeResult = calculateDispatch(nodes, edges, carts);

	const { nodes: faultNodes, edges: faultEdges } = applyFaultsToNetwork(
		nodes,
		edges,
		faults,
		Math.max(...faults.map((f) => f.occurrenceTime)) + 1
	);
	const duringResult = calculateDispatch(faultNodes, faultEdges, carts);

	const repairedFaults = faults.map((f) => ({ ...f, status: 'resolved' as const }));
	const { nodes: repairedNodes, edges: repairedEdges } = applyFaultsToNetwork(
		nodes,
		edges,
		repairedFaults,
		Infinity
	);
	const afterResult = calculateDispatch(repairedNodes, repairedEdges, carts);

	const beforeData: PhaseComparisonData = {
		phase: 'before',
		totalTime: beforeResult.totalTime,
		totalDistance: beforeResult.totalDistance,
		congestionRisk: beforeResult.congestionRisk,
		hasAllPaths: beforeResult.hasAllPaths,
		avgSpeed: beforeResult.totalTime > 0
			? beforeResult.totalDistance / beforeResult.totalTime
			: 0,
		totalWaitTime: beforeResult.routes.reduce((sum, r) => sum + r.waitTime, 0),
		routeCount: beforeResult.routes.filter((r) => r.hasPath).length,
		routes: beforeResult.routes
	};

	const duringData: PhaseComparisonData = {
		phase: 'during',
		totalTime: duringResult.totalTime,
		totalDistance: duringResult.totalDistance,
		congestionRisk: duringResult.congestionRisk,
		hasAllPaths: duringResult.hasAllPaths,
		avgSpeed: duringResult.totalTime > 0
			? duringResult.totalDistance / duringResult.totalTime
			: 0,
		totalWaitTime: duringResult.routes.reduce((sum, r) => sum + r.waitTime, 0),
		routeCount: duringResult.routes.filter((r) => r.hasPath).length,
		routes: duringResult.routes
	};

	const afterData: PhaseComparisonData = {
		phase: 'after',
		totalTime: afterResult.totalTime,
		totalDistance: afterResult.totalDistance,
		congestionRisk: afterResult.congestionRisk,
		hasAllPaths: afterResult.hasAllPaths,
		avgSpeed: afterResult.totalTime > 0
			? afterResult.totalDistance / afterResult.totalTime
			: 0,
		totalWaitTime: afterResult.routes.reduce((sum, r) => sum + r.waitTime, 0),
		routeCount: afterResult.routes.filter((r) => r.hasPath).length,
		routes: afterResult.routes
	};

	const affectedCount = beforeResult.routes.filter((br) => {
		const dr = duringResult.routes.find((r) => r.cartId === br.cartId);
		if (!dr) return true;
		if (!dr.hasPath && br.hasPath) return true;
		if (dr.totalTime > br.totalTime * 1.1) return true;
		return false;
	}).length;

	const recoveredCount = duringResult.routes.filter((dr) => {
		const ar = afterResult.routes.find((r) => r.cartId === dr.cartId);
		const br = beforeResult.routes.find((r) => r.cartId === dr.cartId);
		if (!ar || !br) return false;
		if (ar.hasPath && !dr.hasPath) return true;
		if (ar.totalTime <= br.totalTime * 1.05 && dr.totalTime > br.totalTime * 1.1) return true;
		return false;
	}).length;

	const recoveryRate = beforeData.totalTime > 0 && duringData.totalTime > beforeData.totalTime
		? ((duringData.totalTime - afterData.totalTime) / (duringData.totalTime - beforeData.totalTime)) * 100
		: 100;

	return {
		beforeFault: beforeData,
		duringFault: duringData,
		afterRepair: afterData,
		deltaTime: duringData.totalTime - beforeData.totalTime,
		deltaDistance: duringData.totalDistance - beforeData.totalDistance,
		deltaCongestion: duringData.congestionRisk - beforeData.congestionRisk,
		recoveryRate: Math.max(0, Math.min(100, recoveryRate)),
		affectedCartCount: affectedCount,
		recoveredCartCount: recoveredCount
	};
}

// ============================================================================
//  故障状态时间轴
// ============================================================================

export function getFaultStatusAtTime(fault: Fault, time: number): FaultStatus {
	if (time < fault.occurrenceTime) return 'pending';

	const repairStartTime = fault.repairStartTime ?? fault.occurrenceTime + 5;
	const repairEndTime = repairStartTime + fault.repairDuration;

	if (time >= repairEndTime) return 'resolved';
	if (time >= repairStartTime) return 'repairing';

	return 'pending';
}

export function getActiveFaultsAtTime(faults: Fault[], time: number): Fault[] {
	return faults
		.filter((f) => {
			const status = getFaultStatusAtTime(f, time);
			return status === 'pending' || status === 'repairing';
		})
		.map((f) => ({
			...f,
			status: getFaultStatusAtTime(f, time)
		}));
}

export function isCartAffectedByFault(
	cart: Cart,
	fault: Fault,
	nodes: MineNode[],
	edges: MineEdge[]
): boolean {
	const route = buildTimedRoute(nodes, edges, cart);
	if (!route.hasPath) return true;

	if (fault.targetType === 'edge') {
		return route.positions.some((p) => p.edgeId === fault.targetId);
	} else {
		return route.positions.some((p) => p.nodeId === fault.targetId);
	}
}
