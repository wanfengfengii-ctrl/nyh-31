import type { MineNode, MineEdge, PathResult } from './types';

export function calculateShortestPath(
	nodes: MineNode[],
	edges: MineEdge[],
	sourceId: string,
	targetId: string
): PathResult {
	const nodeMap = new Map<string, MineNode>();
	nodes.forEach((n) => nodeMap.set(n.id, n));

	const adjacency = new Map<string, { nodeId: string; edgeId: string; length: number }[]>();
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
			length: edge.length
		});
		adjacency.get(edge.target)?.push({
			nodeId: edge.source,
			edgeId: edge.id,
			length: edge.length
		});
	});

	const distances = new Map<string, number>();
	const previous = new Map<string, { nodeId: string; edgeId: string } | null>();
	const visited = new Set<string>();

	nodes.forEach((n) => {
		distances.set(n.id, Infinity);
		previous.set(n.id, null);
	});
	distances.set(sourceId, 0);

	while (visited.size < nodes.length) {
		let minDist = Infinity;
		let currentNode = '';

		nodes.forEach((n) => {
			if (!visited.has(n.id) && (distances.get(n.id) ?? Infinity) < minDist) {
				minDist = distances.get(n.id) ?? Infinity;
				currentNode = n.id;
			}
		});

		if (minDist === Infinity || currentNode === '') break;
		visited.add(currentNode);

		const neighbors = adjacency.get(currentNode) || [];
		neighbors.forEach((neighbor) => {
			if (visited.has(neighbor.nodeId)) return;

			const newDist = (distances.get(currentNode) ?? Infinity) + neighbor.length;
			if (newDist < (distances.get(neighbor.nodeId) ?? Infinity)) {
				distances.set(neighbor.nodeId, newDist);
				previous.set(neighbor.nodeId, { nodeId: currentNode, edgeId: neighbor.edgeId });
			}
		});
	}

	const blockedNodes = nodes.filter((n) => n.blocked).map((n) => n.id);

	if (!distances.has(targetId) || distances.get(targetId) === Infinity) {
		const brokenNodes = findBrokenNodes(nodes, edges, sourceId, targetId);
		return {
			nodes: [],
			edges: [],
			totalDistance: 0,
			switchCount: 0,
			blockedNodes,
			brokenNodes,
			hasPath: false
		};
	}

	const pathNodes: string[] = [];
	const pathEdges: string[] = [];
	let current = targetId;

	while (current !== sourceId) {
		pathNodes.unshift(current);
		const prev = previous.get(current);
		if (!prev) break;
		pathEdges.unshift(prev.edgeId);
		current = prev.nodeId;
	}
	pathNodes.unshift(sourceId);

	let switchCount = 0;
	pathEdges.forEach((edgeId) => {
		const edge = edges.find((e) => e.id === edgeId);
		if (edge?.isSwitch) switchCount++;
	});

	return {
		nodes: pathNodes,
		edges: pathEdges,
		totalDistance: distances.get(targetId) ?? 0,
		switchCount,
		blockedNodes,
		brokenNodes: [],
		hasPath: true
	};
}

function findBrokenNodes(
	nodes: MineNode[],
	edges: MineEdge[],
	sourceId: string,
	targetId: string
): string[] {
	const nodeMap = new Map<string, MineNode>();
	nodes.forEach((n) => nodeMap.set(n.id, n));

	const adjacency = new Map<string, string[]>();
	nodes.forEach((n) => adjacency.set(n.id, []));

	edges.forEach((edge) => {
		const sourceNode = nodeMap.get(edge.source);
		const targetNode = nodeMap.get(edge.target);
		if (!sourceNode || !targetNode) return;

		adjacency.get(edge.source)?.push(edge.target);
		adjacency.get(edge.target)?.push(edge.source);
	});

	const reachableFromSource = new Set<string>();
	const queue: string[] = [sourceId];
	reachableFromSource.add(sourceId);

	while (queue.length > 0) {
		const current = queue.shift()!;
		const neighbors = adjacency.get(current) || [];
		neighbors.forEach((n) => {
			if (!reachableFromSource.has(n)) {
				const node = nodeMap.get(n);
				const edge = edges.find(
					(e) =>
						(e.source === current && e.target === n) ||
						(e.target === current && e.source === n)
				);
				const isPassable =
					node &&
					!node.blocked &&
					edge &&
					edge.enabled &&
					(!edge.isSwitch || edge.switchActive);

				if (isPassable) {
					reachableFromSource.add(n);
					queue.push(n);
				}
			}
		});
	}

	const brokenNodes: string[] = [];
	reachableFromSource.forEach((nodeId) => {
		const neighbors = adjacency.get(nodeId) || [];
		neighbors.forEach((neighborId) => {
			if (!reachableFromSource.has(neighborId)) {
				if (!brokenNodes.includes(nodeId)) {
					brokenNodes.push(nodeId);
				}
			}
		});
	});

	return brokenNodes;
}
