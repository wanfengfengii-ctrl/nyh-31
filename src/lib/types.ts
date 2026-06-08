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
