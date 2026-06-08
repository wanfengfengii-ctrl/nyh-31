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
