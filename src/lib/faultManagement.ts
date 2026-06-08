import {
	defaultFaultTypes as domainDefaultFaultTypes,
	getFaultTypesByTarget as domainGetFaultTypesByTarget,
	createFault as domainCreateFault,
	applyFaultsToNetwork as domainApplyFaultsToNetwork,
	assessFaultImpact as domainAssessFaultImpact,
	assessMultipleFaultsImpact as domainAssessMultipleFaultsImpact,
	calculateRepairPriorities as domainCalculateRepairPriorities,
	compareFaultScenarios as domainCompareFaultScenarios,
	getFaultStatusAtTime as domainGetFaultStatusAtTime,
	getActiveFaultsAtTime as domainGetActiveFaultsAtTime,
	isCartAffectedByFault as domainIsCartAffectedByFault,
	generateEmergencyDetour as domainGenerateEmergencyDetour,
	generateAllEmergencyDetours as domainGenerateAllEmergencyDetours,
	calculateEnhancedComparison as domainCalculateEnhancedComparison
} from './domain/fault.service';
import {
	generateFaultPlaybackFrames as timelineGenerateFaultPlaybackFrames,
	generateFaultTimeline as timelineGenerateFaultTimeline,
	generateIntegratedPlayback as timelineGenerateIntegratedPlayback,
	getCartPositionAtTime as timelineGetCartPositionAtTime
} from './domain/timeline.service';

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
	EnhancedComparisonResult,
	FaultTimelineEvent,
	IntegratedPlaybackFrame,
	PlaybackFrame
} from './types';

// ============================================================================
//  故障类型
// ============================================================================

export const defaultFaultTypes: FaultType[] = domainDefaultFaultTypes;

export function getFaultTypesByTarget(
	targetType: FaultTargetType,
	nodeType?: string
): FaultType[] {
	return domainGetFaultTypesByTarget(targetType, nodeType);
}

// ============================================================================
//  故障创建
// ============================================================================

export function createFault(
	targetType: FaultTargetType,
	targetId: string,
	targetLabel: string,
	faultType: FaultType,
	occurrenceTime: number = 0,
	customRepairDuration?: number,
	impactScope: number = 1
): Fault {
	return domainCreateFault(
		targetType,
		targetId,
		targetLabel,
		faultType,
		occurrenceTime,
		customRepairDuration,
		impactScope
	);
}

// ============================================================================
//  故障应用
// ============================================================================

export function applyFaultsToNetwork(
	nodes: MineNode[],
	edges: MineEdge[],
	faults: Fault[],
	currentTime: number = Infinity
): { nodes: MineNode[]; edges: MineEdge[] } {
	return domainApplyFaultsToNetwork(nodes, edges, faults, currentTime);
}

// ============================================================================
//  故障影响评估
// ============================================================================

export function assessFaultImpact(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	fault: Fault
): FaultImpactResult {
	return domainAssessFaultImpact(nodes, edges, carts, fault);
}

export function assessMultipleFaultsImpact(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): FaultImpactResult[] {
	return domainAssessMultipleFaultsImpact(nodes, edges, carts, faults);
}

// ============================================================================
//  维修优先级
// ============================================================================

export function calculateRepairPriorities(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): RepairPriorityItem[] {
	return domainCalculateRepairPriorities(nodes, edges, carts, faults);
}

// ============================================================================
//  场景对比
// ============================================================================

export function compareFaultScenarios(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): FaultComparisonResult {
	return domainCompareFaultScenarios(nodes, edges, carts, faults);
}

// ============================================================================
//  故障回放帧
// ============================================================================

export function generateFaultPlaybackFrames(
	nodes: MineNode[],
	edges: MineEdge[],
	faults: Fault[],
	frameInterval: number = 0.5
): {
	time: number;
	phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered';
	activeFaultIds: string[];
	repairingFaultIds: string[];
	resolvedFaultIds: string[];
	nodes: MineNode[];
	edges: MineEdge[];
	events: { type: string; faultId: string; faultName: string; targetLabel: string }[];
}[] {
	return timelineGenerateFaultPlaybackFrames(nodes, edges, faults, frameInterval);
}

// ============================================================================
//  故障时间轴
// ============================================================================

export function generateFaultTimeline(
	faults: Fault[],
	totalDuration: number
): { time: number; events: { type: string; faultId: string; faultName: string }[] }[] {
	return timelineGenerateFaultTimeline(faults, totalDuration);
}

// ============================================================================
//  故障状态查询
// ============================================================================

export function getFaultStatusAtTime(fault: Fault, time: number): FaultStatus {
	return domainGetFaultStatusAtTime(fault, time);
}

export function getActiveFaultsAtTime(faults: Fault[], time: number): Fault[] {
	return domainGetActiveFaultsAtTime(faults, time);
}

// ============================================================================
//  小车位置
// ============================================================================

export function getCartPositionAtTime(
	route: CartRoute,
	time: number,
	nodes: MineNode[]
): {
	nodeId: string;
	edgeId: string | null;
	progress: number;
	isWaiting: boolean;
	x: number;
	y: number;
} {
	return timelineGetCartPositionAtTime(route, time, nodes);
}

// ============================================================================
//  小车受影响判断
// ============================================================================

export function isCartAffectedByFault(
	cart: Cart,
	fault: Fault,
	nodes: MineNode[],
	edges: MineEdge[]
): boolean {
	return domainIsCartAffectedByFault(cart, fault, nodes, edges);
}

// ============================================================================
//  应急绕行
// ============================================================================

export function generateEmergencyDetour(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	fault: Fault
): EmergencyDetourResult {
	return domainGenerateEmergencyDetour(nodes, edges, carts, fault);
}

export function generateAllEmergencyDetours(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): EmergencyDetourResult[] {
	return domainGenerateAllEmergencyDetours(nodes, edges, carts, faults);
}

// ============================================================================
//  增强对比
// ============================================================================

export function calculateEnhancedComparison(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[]
): EnhancedComparisonResult {
	return domainCalculateEnhancedComparison(nodes, edges, carts, faults);
}

// ============================================================================
//  综合回放
// ============================================================================

export function generateIntegratedPlayback(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[],
	frameInterval: number = 0.5
): IntegratedPlaybackFrame[] {
	return timelineGenerateIntegratedPlayback(nodes, edges, carts, faults, frameInterval);
}
