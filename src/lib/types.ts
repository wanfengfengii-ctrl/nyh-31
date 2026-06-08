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

export interface PathResult {
	nodes: string[];
	edges: string[];
	totalDistance: number;
	switchCount: number;
	blockedNodes: string[];
	brokenNodes: string[];
	hasPath: boolean;
}

export interface MineScheme {
	id: string;
	name: string;
	nodes: MineNode[];
	edges: MineEdge[];
	createdAt: number;
	updatedAt: number;
}

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

export interface PlaybackEvent {
	time: number;
	type: 'depart' | 'arrive' | 'wait' | 'conflict' | 'switch';
	cartId: string;
	cartName: string;
	description: string;
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

export interface FaultPlaybackState {
	currentTime: number;
	faults: Fault[];
	activeFaultIds: string[];
	resolvedFaultIds: string[];
	phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered';
}
