import { writable, derived, get } from 'svelte/store';
import type { MineNode, MineEdge, PathResult, MineScheme, NodeType } from './types';
import { calculateShortestPath } from './pathfinding';

function createNodeId(): string {
	return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createEdgeId(): string {
	return `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createSchemeId(): string {
	return `scheme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const initialNodes: MineNode[] = [
	{ id: 'n1', label: '1', type: 'loading', x: 100, y: 200, blocked: false },
	{ id: 'n2', label: '2', type: 'normal', x: 300, y: 200, blocked: false },
	{ id: 'n3', label: '3', type: 'switch', x: 500, y: 200, blocked: false },
	{ id: 'n4', label: '4', type: 'normal', x: 700, y: 100, blocked: false },
	{ id: 'n5', label: '5', type: 'normal', x: 700, y: 300, blocked: false },
	{ id: 'n6', label: '6', type: 'unloading', x: 900, y: 200, blocked: false }
];

const initialEdges: MineEdge[] = [
	{ id: 'e1', source: 'n1', target: 'n2', length: 50, enabled: true, isSwitch: false, switchActive: false },
	{ id: 'e2', source: 'n2', target: 'n3', length: 80, enabled: true, isSwitch: false, switchActive: false },
	{ id: 'e3', source: 'n3', target: 'n4', length: 60, enabled: true, isSwitch: true, switchActive: true },
	{ id: 'e4', source: 'n3', target: 'n5', length: 70, enabled: true, isSwitch: true, switchActive: false },
	{ id: 'e5', source: 'n4', target: 'n6', length: 90, enabled: true, isSwitch: false, switchActive: false },
	{ id: 'e6', source: 'n5', target: 'n6', length: 55, enabled: true, isSwitch: false, switchActive: false }
];

export const nodes = writable<MineNode[]>(initialNodes);
export const edges = writable<MineEdge[]>(initialEdges);
export const selectedNodeId = writable<string | null>(null);
export const selectedEdgeId = writable<string | null>(null);
export const loadingNodeId = writable<string>('n1');
export const unloadingNodeId = writable<string>('n6');
export const schemes = writable<MineScheme[]>([]);
export const currentSchemeName = writable<string>('默认方案');

export const pathResult = derived(
	[nodes, edges, loadingNodeId, unloadingNodeId],
	([$nodes, $edges, $loadingId, $unloadingId]) => {
		if (!$loadingId || !$unloadingId) {
			return {
				nodes: [],
				edges: [],
				totalDistance: 0,
				switchCount: 0,
				blockedNodes: [],
				brokenNodes: [],
				hasPath: false
			} as PathResult;
		}
		return calculateShortestPath($nodes, $edges, $loadingId, $unloadingId);
	}
);

export function addNode(x: number, y: number, type: NodeType = 'normal'): MineNode {
	const $nodes = get(nodes);
	const existingLabels = $nodes.map((n) => parseInt(n.label)).filter((n) => !isNaN(n));
	const maxLabel = existingLabels.length > 0 ? Math.max(...existingLabels) : 0;
	const newLabel = String(maxLabel + 1);

	const newNode: MineNode = {
		id: createNodeId(),
		label: newLabel,
		type,
		x,
		y,
		blocked: false
	};

	nodes.update((ns) => [...ns, newNode]);
	return newNode;
}

export function updateNode(nodeId: string, updates: Partial<MineNode>) {
	nodes.update((ns) => ns.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)));
}

export function deleteNode(nodeId: string) {
	nodes.update((ns) => ns.filter((n) => n.id !== nodeId));
	edges.update((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));

	loadingNodeId.update((id) => (id === nodeId ? '' : id));
	unloadingNodeId.update((id) => (id === nodeId ? '' : id));
	selectedNodeId.update((id) => (id === nodeId ? null : id));
}

export function addEdge(sourceId: string, targetId: string, length: number = 50): MineEdge | null {
	const $nodes = get(nodes);
	const source = $nodes.find((n) => n.id === sourceId);
	const target = $nodes.find((n) => n.id === targetId);

	if (!source || !target || sourceId === targetId) return null;
	if (length <= 0) return null;

	const $edges = get(edges);
	const exists = $edges.some(
		(e) =>
			(e.source === sourceId && e.target === targetId) ||
			(e.source === targetId && e.target === sourceId)
	);
	if (exists) return null;

	const newEdge: MineEdge = {
		id: createEdgeId(),
		source: sourceId,
		target: targetId,
		length,
		enabled: true,
		isSwitch: false,
		switchActive: false
	};

	edges.update((es) => [...es, newEdge]);
	return newEdge;
}

export function updateEdge(edgeId: string, updates: Partial<MineEdge>) {
	edges.update((es) => es.map((e) => (e.id === edgeId ? { ...e, ...updates } : e)));
}

export function deleteEdge(edgeId: string) {
	edges.update((es) => es.filter((e) => e.id !== edgeId));
	selectedEdgeId.update((id) => (id === edgeId ? null : id));
}

export function toggleSwitch(edgeId: string) {
	edges.update((es) =>
		es.map((e) => (e.id === edgeId ? { ...e, switchActive: !e.switchActive } : e))
	);
}

export function saveScheme(name: string) {
	const $nodes = get(nodes);
	const $edges = get(edges);
	const now = Date.now();

	const newScheme: MineScheme = {
		id: createSchemeId(),
		name,
		nodes: JSON.parse(JSON.stringify($nodes)),
		edges: JSON.parse(JSON.stringify($edges)),
		createdAt: now,
		updatedAt: now
	};

	schemes.update((s) => [...s, newScheme]);
	currentSchemeName.set(name);
}

export function loadScheme(schemeId: string) {
	const $schemes = get(schemes);
	const scheme = $schemes.find((s) => s.id === schemeId);
	if (!scheme) return;

	nodes.set(JSON.parse(JSON.stringify(scheme.nodes)));
	edges.set(JSON.parse(JSON.stringify(scheme.edges)));
	currentSchemeName.set(scheme.name);

	const loadingNode = scheme.nodes.find((n) => n.type === 'loading');
	const unloadingNode = scheme.nodes.find((n) => n.type === 'unloading');
	if (loadingNode) loadingNodeId.set(loadingNode.id);
	if (unloadingNode) unloadingNodeId.set(unloadingNode.id);
}

export function deleteScheme(schemeId: string) {
	schemes.update((s) => s.filter((scheme) => scheme.id !== schemeId));
}

export function isLabelDuplicate(label: string, excludeId?: string): boolean {
	const $nodes = get(nodes);
	return $nodes.some((n) => n.label === label && n.id !== excludeId);
}
