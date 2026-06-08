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
	PathResult
} from './types';
import { calculateShortestPath } from './pathfinding';
import { calculateDispatch, buildTimedRoute } from './dispatch';

function createFaultId(): string {
	return `fault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

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

export function getFaultTypesByTarget(targetType: FaultTargetType, nodeType?: string): FaultType[] {
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

export function assessMultipleFaultsImpact(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): FaultImpactResult[] {
	return faults.map((fault) => assessFaultImpact(nodes, edges, carts, fault));
}

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

	const afterRepair = beforeFault;

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

export function generateFaultTimeline(
	faults: Fault[],
	totalDuration: number
): { time: number; events: { type: string; faultId: string; faultName: string }[] }[] {
	const timeline: {
		time: number;
		events: { type: string; faultId: string; faultName: string }[];
	}[] = [];

	const timeEvents = new Map<
		number,
		{ type: string; faultId: string; faultName: string }[]
	>();

	faults.forEach((fault) => {
		if (!timeEvents.has(fault.occurrenceTime)) {
			timeEvents.set(fault.occurrenceTime, []);
		}
		timeEvents.get(fault.occurrenceTime)!.push({
			type: 'fault-occur',
			faultId: fault.id,
			faultName: fault.faultTypeName
		});

		const repairStartTime = fault.repairStartTime ?? fault.occurrenceTime + 5;
		if (!timeEvents.has(repairStartTime)) {
			timeEvents.set(repairStartTime, []);
		}
		timeEvents.get(repairStartTime)!.push({
			type: 'repair-start',
			faultId: fault.id,
			faultName: fault.faultTypeName
		});

		const repairEndTime = repairStartTime + fault.repairDuration;
		if (!timeEvents.has(repairEndTime)) {
			timeEvents.set(repairEndTime, []);
		}
		timeEvents.get(repairEndTime)!.push({
			type: 'repair-complete',
			faultId: fault.id,
			faultName: fault.faultTypeName
		});
	});

	const sortedTimes = Array.from(timeEvents.keys()).sort((a, b) => a - b);

	sortedTimes.forEach((time) => {
		if (time <= totalDuration) {
			timeline.push({
				time,
				events: timeEvents.get(time)!
			});
		}
	});

	return timeline;
}

export function getFaultStatusAtTime(fault: Fault, time: number): FaultStatus {
	if (time < fault.occurrenceTime) return 'pending';

	const repairStartTime = fault.repairStartTime ?? fault.occurrenceTime + 5;
	const repairEndTime = repairStartTime + fault.repairDuration;

	if (time >= repairEndTime) return 'resolved';
	if (time >= repairStartTime) return 'repairing';

	return 'pending';
}

export function getActiveFaultsAtTime(faults: Fault[], time: number): Fault[] {
	return faults.filter((f) => {
		const status = getFaultStatusAtTime(f, time);
		return status === 'pending' || status === 'repairing';
	});
}
