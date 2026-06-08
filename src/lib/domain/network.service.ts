// ============================================================================
//  网络基础服务 (Network Service)
// ============================================================================
//  提供轨道网络的基础操作：
//    - 图构建与邻接表生成
//    - 节点/轨道查询与缓存
//    - 网络状态快照
//    - 占用表管理（时间窗）
// ============================================================================

import type {
	MineNode,
	MineEdge,
	AdjacencyMap,
	AdjacencyEntry,
	NetworkState,
	OccupancyTable,
	TimeWindow
} from './models';

// ============================================================================
//  节点 / 轨道查询工具
// ============================================================================

export function getNodeById(nodes: MineNode[], nodeId: string): MineNode | undefined {
	return nodes.find((n) => n.id === nodeId);
}

export function getEdgeById(edges: MineEdge[], edgeId: string): MineEdge | undefined {
	return edges.find((e) => e.id === edgeId);
}

export function buildNodeMap(nodes: MineNode[]): Map<string, MineNode> {
	return new Map(nodes.map((n) => [n.id, n]));
}

export function buildEdgeMap(edges: MineEdge[]): Map<string, MineEdge> {
	return new Map(edges.map((e) => [e.id, e]));
}

// ============================================================================
//  网络状态快照
// ============================================================================

export function createNetworkState(nodes: MineNode[], edges: MineEdge[]): NetworkState {
	return {
		nodes: [...nodes],
		edges: [...edges],
		nodeMap: buildNodeMap(nodes),
		edgeMap: buildEdgeMap(edges)
	};
}

// ============================================================================
//  邻接表构建
// ============================================================================

/**
 * 构建轨道网络的邻接表
 * 仅包含可通行的边（enabled 且非关闭的道岔）和非阻塞节点
 */
export function buildAdjacencyList(
	nodes: MineNode[],
	edges: MineEdge[]
): AdjacencyMap {
	const nodeMap = buildNodeMap(nodes);
	const adjacency = new Map<string, AdjacencyEntry[]>();

	nodes.forEach((n) => adjacency.set(n.id, []));

	edges.forEach((edge) => {
		if (!edge.enabled) return;
		if (edge.isSwitch && !edge.switchActive) return;

		const sourceNode = nodeMap.get(edge.source);
		const targetNode = nodeMap.get(edge.target);
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

/**
 * 构建包含所有边的邻接表（用于可达性分析）
 */
export function buildFullAdjacencyList(
	nodes: MineNode[],
	edges: MineEdge[]
): AdjacencyMap {
	const adjacency = new Map<string, AdjacencyEntry[]>();

	nodes.forEach((n) => adjacency.set(n.id, []));

	edges.forEach((edge) => {
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

// ============================================================================
//  占用表管理 (Occupancy Table)
// ============================================================================

/**
 * 创建空的占用表
 */
export function createOccupancyTable(): OccupancyTable {
	return {
		edgeOccupancies: new Map(),
		nodeOccupancies: new Map()
	};
}

/**
 * 添加边占用时间窗
 */
export function addEdgeOccupancy(
	table: OccupancyTable,
	edgeId: string,
	start: number,
	end: number,
	cartId: string
): void {
	if (!table.edgeOccupancies.has(edgeId)) {
		table.edgeOccupancies.set(edgeId, []);
	}
	table.edgeOccupancies.get(edgeId)!.push({ start, end, cartId });
	table.edgeOccupancies.get(edgeId)!.sort((a, b) => a.start - b.start);
}

/**
 * 添加节点占用时间窗
 */
export function addNodeOccupancy(
	table: OccupancyTable,
	nodeId: string,
	start: number,
	end: number,
	cartId: string
): void {
	if (!table.nodeOccupancies.has(nodeId)) {
		table.nodeOccupancies.set(nodeId, []);
	}
	table.nodeOccupancies.get(nodeId)!.push({ start, end, cartId });
	table.nodeOccupancies.get(nodeId)!.sort((a, b) => a.start - b.start);
}

/**
 * 查找最早可用时间
 * @param occupancies 已有的占用时间窗列表
 * @param desiredStart 期望开始时间
 * @param duration 需要的持续时间
 * @param buffer 时间缓冲（前后各留出的安全时间）
 */
export function findEarliestAvailableTime(
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

// ============================================================================
//  时间工具
// ============================================================================

/**
 * 计算旅行时间
 */
export function calculateTravelTime(length: number, speed: number): number {
	if (speed <= 0) return Infinity;
	return length / speed;
}

/**
 * 判断两个时间区间是否重叠
 */
export function timeOverlap(
	start1: number,
	end1: number,
	start2: number,
	end2: number
): boolean {
	return start1 < end2 && start2 < end1;
}

// ============================================================================
//  BFS 可达性分析
// ============================================================================

/**
 * BFS 查找从源点可达的所有节点
 */
export function findReachableNodes(
	nodes: MineNode[],
	edges: MineEdge[],
	sourceId: string
): Set<string> {
	const nodeMap = buildNodeMap(nodes);
	const adjacency = buildFullAdjacencyList(nodes, edges);
	const reachable = new Set<string>();
	const queue: string[] = [sourceId];
	reachable.add(sourceId);

	while (queue.length > 0) {
		const current = queue.shift()!;
		const neighbors = adjacency.get(current) || [];

		neighbors.forEach((n) => {
			if (!reachable.has(n.nodeId)) {
				const node = nodeMap.get(n.nodeId);
				const edge = getEdgeById(edges, n.edgeId);
				const isPassable =
					node &&
					!node.blocked &&
					edge &&
					edge.enabled &&
					(!edge.isSwitch || edge.switchActive);

				if (isPassable) {
					reachable.add(n.nodeId);
					queue.push(n.nodeId);
				}
			}
		});
	}

	return reachable;
}

/**
 * 查找断点节点（位于可达区域边界的节点）
 */
export function findBrokenNodes(
	nodes: MineNode[],
	edges: MineEdge[],
	sourceId: string
): string[] {
	const reachableFromSource = findReachableNodes(nodes, edges, sourceId);
	const adjacency = buildFullAdjacencyList(nodes, edges);
	const brokenNodes: string[] = [];

	reachableFromSource.forEach((nodeId) => {
		const neighbors = adjacency.get(nodeId) || [];
		neighbors.forEach((neighbor) => {
			if (!reachableFromSource.has(neighbor.nodeId)) {
				if (!brokenNodes.includes(nodeId)) {
					brokenNodes.push(nodeId);
				}
			}
		});
	});

	return brokenNodes;
}
