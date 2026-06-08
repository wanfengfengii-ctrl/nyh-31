import type { MineNode, MineEdge, PathResult } from './types';
import { calculateShortestPath as domainCalculateShortestPath } from './domain/pathfinding.service';

/**
 * 计算两点间的最短路径（基于距离）
 * 这是一个薄包装器，实际逻辑在 domain/pathfinding.service.ts 中
 */
export function calculateShortestPath(
	nodes: MineNode[],
	edges: MineEdge[],
	sourceId: string,
	targetId: string
): PathResult {
	return domainCalculateShortestPath(nodes, edges, sourceId, targetId);
}
