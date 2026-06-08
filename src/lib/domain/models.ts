// ============================================================================
//  老矿洞轨道模拟系统 - 核心领域模型
// ============================================================================
//  统一节点 / 轨道 / 故障 / 小车 / 时间轴 的数据模型
//  所有领域服务均基于此模型工作
// ============================================================================

// ---------------------------------------------------------------------------
//  网络模型 (Network Model)
// ---------------------------------------------------------------------------

export type NodeType = 'normal' | 'loading' | 'unloading' | 'switch';

export interface MineNode {
	id: string;
	label: string;
	type: NodeType;
	x: number;
	y: number;
	blocked: boolean;
}

export interface MineEdge {
	id: string;
	source: string;
	target: string;
	length: number;
	enabled: boolean;
	isSwitch: boolean;
	switchActive: boolean;
}

export interface MineScheme {
	id: string;
	name: string;
	nodes: MineNode[];
	edges: MineEdge[];
	createdAt: number;
	updatedAt: number;
}

export interface AdjacencyEntry {
	nodeId: string;
	edgeId: string;
	length: number;
	isSwitch: boolean;
}

export type AdjacencyMap = Map<string, AdjacencyEntry[]>;

// ---------------------------------------------------------------------------
//  路径模型 (Path Model)
// ---------------------------------------------------------------------------

export interface PathResult {
	nodes: string[];
	edges: string[];
	totalDistance: number;
	switchCount: number;
	blockedNodes: string[];
	brokenNodes: string[];
	hasPath: boolean;
}

// ---------------------------------------------------------------------------
//  小车模型 (Cart Model)
// ---------------------------------------------------------------------------

export interface Cart {
	id: string;
	name: string;
	sourceId: string;
	targetId: string;
	departureTime: number;
	priority: number;
	speed: number;
	color: string;
}

export interface TimedPosition {
	nodeId: string;
	edgeId: string | null;
	arrivalTime: number;
	departureTime: number;
	isSwitch: boolean;
}

export interface CartRoute {
	cartId: string;
	cartName: string;
	positions: TimedPosition[];
	totalDistance: number;
	totalTime: number;
	switchCount: number;
	hasPath: boolean;
	waitTime: number;
}

// ---------------------------------------------------------------------------
//  调度模型 (Dispatch Model)
// ---------------------------------------------------------------------------

export interface Conflict {
	id: string;
	type: 'edge' | 'node' | 'switch';
	edgeId?: string;
	nodeId?: string;
	cart1Id: string;
	cart2Id: string;
	cart1Name: string;
	cart2Name: string;
	startTime: number;
	endTime: number;
	severity: 'low' | 'medium' | 'high';
	description: string;
}

export interface DispatchResult {
	routes: CartRoute[];
	conflicts: Conflict[];
	totalTime: number;
	totalDistance: number;
	totalSwitchCount: number;
	congestionRisk: number;
	hasAllPaths: boolean;
}

export interface DispatchScheme {
	id: string;
	name: string;
	carts: Cart[];
	nodes: MineNode[];
	edges: MineEdge[];
	createdAt: number;
	updatedAt: number;
}

export interface TimeWindow {
	start: number;
	end: number;
	cartId: string;
}

export interface OccupancyTable {
	edgeOccupancies: Map<string, TimeWindow[]>;
	nodeOccupancies: Map<string, TimeWindow[]>;
}

// ---------------------------------------------------------------------------
//  故障模型 (Fault Model)
// ---------------------------------------------------------------------------

export type FaultTargetType = 'node' | 'edge';
export type FaultSeverity = 'minor' | 'major' | 'critical';
export type FaultStatus = 'pending' | 'repairing' | 'resolved';

export interface FaultType {
	id: string;
	name: string;
	description: string;
	severity: FaultSeverity;
	defaultRepairTime: number;
}

export interface Fault {
	id: string;
	targetType: FaultTargetType;
	targetId: string;
	targetLabel: string;
	faultTypeId: string;
	faultTypeName: string;
	description: string;
	severity: FaultSeverity;
	occurrenceTime: number;
	repairDuration: number;
	repairStartTime: number | null;
	impactScope: number;
	status: FaultStatus;
	priority: number;
}

export interface AffectedCart {
	cartId: string;
	cartName: string;
	cartColor: string;
	originalRoute: string[];
	alternativeRoute: string[] | null;
	delayTime: number;
	originalTotalTime: number;
	newTotalTime: number;
	hasAlternative: boolean;
	impactLevel: 'high' | 'medium' | 'low';
}

export interface FaultImpactResult {
	faultId: string;
	faultName: string;
	affectedCarts: AffectedCart[];
	totalAffectedCount: number;
	totalDelayTime: number;
	hasUnreachableCarts: boolean;
	alternativeRoutesAvailable: boolean;
}

export interface RepairPriorityItem {
	faultId: string;
	faultName: string;
	targetLabel: string;
	severity: FaultSeverity;
	priority: number;
	affectedCartCount: number;
	totalDelayTime: number;
	repairDuration: number;
	estimatedRecoveryTime: number;
}

export interface FaultComparisonResult {
	beforeFault: DispatchResult | null;
	afterFault: DispatchResult | null;
	afterRepair: DispatchResult | null;
	deltaTotalTime: number;
	deltaTotalDistance: number;
	deltaCongestionRisk: number;
	affectedCartCount: number;
}

export type WaitStrategy = 'hold_at_node' | 'reroute_immediately' | 'wait_then_reroute';

export interface DetourPlan {
	cartId: string;
	cartName: string;
	cartColor: string;
	originalRoute: string[];
	detourRoute: string[];
	originalTotalTime: number;
	detourTotalTime: number;
	delayTime: number;
	additionalDistance: number;
	waitStrategy: WaitStrategy;
	waitNodeId?: string;
	waitDuration: number;
	feasible: boolean;
	reason?: string;
}

export interface EmergencyDetourResult {
	faultId: string;
	faultName: string;
	detourPlans: DetourPlan[];
	totalAffectedCarts: number;
	totalFeasibleDetours: number;
	totalDelayEstimate: number;
	recommendation: string;
}

export interface PhaseComparisonData {
	phase: 'before' | 'during' | 'after';
	totalTime: number;
	totalDistance: number;
	congestionRisk: number;
	hasAllPaths: boolean;
	avgSpeed: number;
	totalWaitTime: number;
	routeCount: number;
	routes: CartRoute[];
}

export interface EnhancedComparisonResult {
	beforeFault: PhaseComparisonData;
	duringFault: PhaseComparisonData;
	afterRepair: PhaseComparisonData;
	deltaTime: number;
	deltaDistance: number;
	deltaCongestion: number;
	recoveryRate: number;
	affectedCartCount: number;
	recoveredCartCount: number;
}

// ---------------------------------------------------------------------------
//  时间轴 / 回放模型 (Timeline / Playback Model)
// ---------------------------------------------------------------------------

export interface PlaybackEvent {
	time: number;
	type: 'depart' | 'arrive' | 'wait' | 'conflict' | 'switch';
	cartId: string;
	cartName: string;
	description: string;
}

export interface PlaybackFrame {
	time: number;
	cartStates: {
		cartId: string;
		cartName: string;
		x: number;
		y: number;
		currentNodeId: string;
		nextNodeId: string | null;
		progress: number;
		isWaiting: boolean;
		waitRemaining: number;
		waitNodeLabel: string;
		color: string;
	}[];
	congestedEdges: { edgeId: string; level: number }[];
	events: PlaybackEvent[];
}

export interface FaultPlaybackState {
	currentTime: number;
	faults: Fault[];
	activeFaultIds: string[];
	resolvedFaultIds: string[];
	phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered';
}

export interface FaultTimelineEvent {
	time: number;
	type: 'fault-occur' | 'repair-start' | 'repair-complete' | 'reroute' | 'congestion-warning' | 'cart-arrive' | 'cart-depart';
	faultId?: string;
	faultName?: string;
	cartId?: string;
	cartName?: string;
	description: string;
	severity?: 'low' | 'medium' | 'high';
}

export interface IntegratedPlaybackFrame {
	time: number;
	phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered';
	cartStates: PlaybackFrame['cartStates'];
	congestedEdges: { edgeId: string; level: number }[];
	activeFaultIds: string[];
	repairingFaultIds: string[];
	resolvedFaultIds: string[];
	repairProgress: { faultId: string; progress: number; remainingTime: number }[];
	events: FaultTimelineEvent[];
	nodes: MineNode[];
	edges: MineEdge[];
	dispatchResultSnapshot?: DispatchResult;
}

// ---------------------------------------------------------------------------
//  网络状态快照 (Network State Snapshot)
// ---------------------------------------------------------------------------

export interface NetworkState {
	nodes: MineNode[];
	edges: MineEdge[];
	nodeMap: Map<string, MineNode>;
	edgeMap: Map<string, MineEdge>;
}
