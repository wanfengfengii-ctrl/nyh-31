import { writable, derived, get } from 'svelte/store';
import type {
	MineNode,
	MineEdge,
	PathResult,
	MineScheme,
	NodeType,
	Cart,
	DispatchResult,
	DispatchScheme,
	Fault,
	FaultType,
	FaultTargetType,
	FaultImpactResult,
	RepairPriorityItem,
	FaultComparisonResult
} from './types';
import { calculateShortestPath } from './pathfinding';
import { calculateDispatch, getDefaultCarts, createNewCart } from './dispatch';
import {
	createFault,
	assessFaultImpact,
	calculateRepairPriorities,
	compareFaultScenarios,
	defaultFaultTypes,
	getFaultTypesByTarget,
	applyFaultsToNetwork,
	getActiveFaultsAtTime
} from './faultManagement';

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

function createDispatchSchemeId(): string {
	return `dispatch_scheme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const carts = writable<Cart[]>([]);

export const dispatchResult = derived(
	[nodes, edges, carts],
	([$nodes, $edges, $carts]) => {
		if ($carts.length === 0) {
			return {
				routes: [],
				conflicts: [],
				totalTime: 0,
				totalDistance: 0,
				totalSwitchCount: 0,
				congestionRisk: 0,
				hasAllPaths: false
			} as DispatchResult;
		}
		return calculateDispatch($nodes, $edges, $carts);
	}
);

export const dispatchSchemes = writable<DispatchScheme[]>([]);
export const currentDispatchSchemeName = writable<string>('默认调度方案');

export function initDefaultCarts() {
	const $loadingNodeId = get(loadingNodeId);
	const $unloadingNodeId = get(unloadingNodeId);
	if ($loadingNodeId && $unloadingNodeId) {
		carts.set(getDefaultCarts($loadingNodeId, $unloadingNodeId));
	}
}

export function addCart() {
	const $carts = get(carts);
	const $loadingNodeId = get(loadingNodeId);
	const $unloadingNodeId = get(unloadingNodeId);
	if ($loadingNodeId && $unloadingNodeId) {
		const newCart = createNewCart($loadingNodeId, $unloadingNodeId, $carts.length);
		carts.update((cs) => [...cs, newCart]);
	}
}

export function updateCart(cartId: string, updates: Partial<Cart>) {
	carts.update((cs) => cs.map((c) => (c.id === cartId ? { ...c, ...updates } : c)));
}

export function deleteCart(cartId: string) {
	carts.update((cs) => cs.filter((c) => c.id !== cartId));
}

export function saveDispatchScheme(name: string) {
	const $carts = get(carts);
	const $nodes = get(nodes);
	const $edges = get(edges);
	const now = Date.now();

	const newScheme: DispatchScheme = {
		id: createDispatchSchemeId(),
		name,
		carts: JSON.parse(JSON.stringify($carts)),
		nodes: JSON.parse(JSON.stringify($nodes)),
		edges: JSON.parse(JSON.stringify($edges)),
		createdAt: now,
		updatedAt: now
	};

	dispatchSchemes.update((s) => [...s, newScheme]);
	currentDispatchSchemeName.set(name);
}

export function loadDispatchScheme(schemeId: string) {
	const $schemes = get(dispatchSchemes);
	const scheme = $schemes.find((s) => s.id === schemeId);
	if (!scheme) return;

	carts.set(JSON.parse(JSON.stringify(scheme.carts)));
	nodes.set(JSON.parse(JSON.stringify(scheme.nodes)));
	edges.set(JSON.parse(JSON.stringify(scheme.edges)));
	currentDispatchSchemeName.set(scheme.name);

	const loadingNode = scheme.nodes.find((n) => n.type === 'loading');
	const unloadingNode = scheme.nodes.find((n) => n.type === 'unloading');
	if (loadingNode) loadingNodeId.set(loadingNode.id);
	if (unloadingNode) unloadingNodeId.set(unloadingNode.id);
}

export function deleteDispatchScheme(schemeId: string) {
	dispatchSchemes.update((s) => s.filter((scheme) => scheme.id !== schemeId));
}

export const faults = writable<Fault[]>([]);
export const selectedFaultId = writable<string | null>(null);
export const showFaultPanel = writable<boolean>(false);

export const faultImpactResults = derived(
	[nodes, edges, carts, faults],
	([$nodes, $edges, $carts, $faults]) => {
		if ($faults.length === 0 || $carts.length === 0) return [];
		return $faults.map((fault) => assessFaultImpact($nodes, $edges, $carts, fault));
	}
);

export const repairPriorities = derived(
	[nodes, edges, carts, faults],
	([$nodes, $edges, $carts, $faults]) => {
		if ($faults.length === 0 || $carts.length === 0) return [];
		return calculateRepairPriorities($nodes, $edges, $carts, $faults);
	}
);

export const faultComparisonResult = derived(
	[nodes, edges, carts, faults],
	([$nodes, $edges, $carts, $faults]) => {
		if ($faults.length === 0 || $carts.length === 0) return null;
		return compareFaultScenarios($nodes, $edges, $carts, $faults);
	}
);

export const nodesWithFaults = derived([nodes, faults], ([$nodes, $faults]) => {
	const activeNodeFaults = $faults.filter(
		(f) => f.targetType === 'node' && f.status !== 'resolved' && f.severity !== 'minor'
	);
	if (activeNodeFaults.length === 0) return $nodes;

	return $nodes.map((node) => {
		const hasFault = activeNodeFaults.some((f) => f.targetId === node.id);
		return hasFault ? { ...node, blocked: true } : node;
	});
});

export const edgesWithFaults = derived([edges, faults], ([$edges, $faults]) => {
	const activeEdgeFaults = $faults.filter(
		(f) => f.targetType === 'edge' && f.status !== 'resolved' && f.severity !== 'minor'
	);
	if (activeEdgeFaults.length === 0) return $edges;

	return $edges.map((edge) => {
		const hasFault = activeEdgeFaults.some((f) => f.targetId === edge.id);
		return hasFault ? { ...edge, enabled: false } : edge;
	});
});

export function addFault(
	targetType: FaultTargetType,
	targetId: string,
	targetLabel: string,
	faultType: FaultType,
	occurrenceTime: number = 0,
	customRepairDuration?: number,
	impactScope: number = 1
): Fault {
	const fault = createFault(
		targetType,
		targetId,
		targetLabel,
		faultType,
		occurrenceTime,
		customRepairDuration,
		impactScope
	);
	faults.update((fs) => [...fs, fault]);
	return fault;
}

export function updateFault(faultId: string, updates: Partial<Fault>) {
	faults.update((fs) => fs.map((f) => (f.id === faultId ? { ...f, ...updates } : f)));
}

export function deleteFault(faultId: string) {
	faults.update((fs) => fs.filter((f) => f.id !== faultId));
	selectedFaultId.update((id) => (id === faultId ? null : id));
}

export function startRepair(faultId: string, startTime?: number) {
	const $faults = get(faults);
	const fault = $faults.find((f) => f.id === faultId);
	if (!fault) return;

	const repairStartTime = startTime ?? fault.occurrenceTime + 5;
	updateFault(faultId, {
		status: 'repairing',
		repairStartTime
	});
}

export function resolveFault(faultId: string) {
	updateFault(faultId, { status: 'resolved' });
}

export function getAvailableFaultTypes(targetType: FaultTargetType, nodeType?: string): FaultType[] {
	return getFaultTypesByTarget(targetType, nodeType);
}

export function getFaultTypeById(faultTypeId: string): FaultType | undefined {
	return defaultFaultTypes.find((ft) => ft.id === faultTypeId);
}

export function clearAllFaults() {
	faults.set([]);
	selectedFaultId.set(null);
}

export const playbackActive = writable<boolean>(false);
export const playbackTime = writable<number>(0);

export function setPlaybackActive(active: boolean) {
	playbackActive.set(active);
}

export function setPlaybackTime(time: number) {
	playbackTime.set(time);
}

export const playbackNodes = derived(
	[nodes, faults, playbackActive, playbackTime],
	([$nodes, $faults, $playbackActive, $playbackTime]) => {
		if (!$playbackActive) return $nodes;

		const activeFaults = getActiveFaultsAtTime($faults, $playbackTime).filter(
			(f) => f.targetType === 'node' && f.severity !== 'minor'
		);
		if (activeFaults.length === 0) return $nodes;

		return $nodes.map((node) => {
			const hasFault = activeFaults.some((f) => f.targetId === node.id);
			return hasFault ? { ...node, blocked: true } : node;
		});
	}
);

export const playbackEdges = derived(
	[edges, faults, playbackActive, playbackTime],
	([$edges, $faults, $playbackActive, $playbackTime]) => {
		if (!$playbackActive) return $edges;

		const activeFaults = getActiveFaultsAtTime($faults, $playbackTime).filter(
			(f) => f.targetType === 'edge' && f.severity !== 'minor'
		);
		if (activeFaults.length === 0) return $edges;

		return $edges.map((edge) => {
			const hasFault = activeFaults.some((f) => f.targetId === edge.id);
			return hasFault ? { ...edge, enabled: false } : edge;
		});
	}
);
