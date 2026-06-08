<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import cytoscape from 'cytoscape';
	import type { Core, ElementDefinition } from 'cytoscape';
	import {
		nodes as nodesStore,
		edges as edgesStore,
		selectedNodeId,
		selectedEdgeId,
		pathResult,
		faults as faultsStore
	} from '$lib/stores';
	import type {
		MineNode,
		MineEdge,
		NodeType,
		PathResult as PathResultType,
		PlaybackFrame,
		Fault,
		FaultStatus
	} from '$lib/types';
	import { createEventDispatcher } from 'svelte';

	export let addMode: NodeType | 'edge' | null = null;
	export let playbackFrame: PlaybackFrame | null = null;

	const dispatch = createEventDispatcher<{
		addNode: { x: number; y: number; type: NodeType };
		addEdge: { source: string; target: string };
	}>();

	let cyContainer: HTMLDivElement;
	let cy: Core | null = null;
	let firstNodeForEdge: string | null = null;

	function getNodeColor(type: NodeType, blocked: boolean): string {
		if (blocked) return '#ef4444';
		switch (type) {
			case 'loading':
				return '#22c55e';
			case 'unloading':
				return '#3b82f6';
			case 'switch':
				return '#f59e0b';
			default:
				return '#6b7280';
		}
	}

	function getFaultSeverityColor(severity: string): string {
		switch (severity) {
			case 'critical':
				return '#dc2626';
			case 'major':
				return '#f97316';
			case 'minor':
				return '#eab308';
			default:
				return '#6b7280';
		}
	}

	function getNodeFaultInfo(nodeId: string, $faults: Fault[]): {
		hasFault: boolean;
		status: FaultStatus | null;
		severity: string | null;
		faultCount: number;
	} {
		const nodeFaults = $faults.filter(
			(f) => f.targetType === 'node' && f.targetId === nodeId && f.status !== 'resolved'
		);
		if (nodeFaults.length === 0) {
			return { hasFault: false, status: null, severity: null, faultCount: 0 };
		}
		const highestSeverity = nodeFaults.some((f) => f.severity === 'critical')
			? 'critical'
			: nodeFaults.some((f) => f.severity === 'major')
				? 'major'
				: 'minor';
		const status = nodeFaults.some((f) => f.status === 'repairing')
			? 'repairing'
			: 'pending';
		return { hasFault: true, status, severity: highestSeverity, faultCount: nodeFaults.length };
	}

	function getEdgeFaultInfo(edgeId: string, $faults: Fault[]): {
		hasFault: boolean;
		status: FaultStatus | null;
		severity: string | null;
		faultCount: number;
	} {
		const edgeFaults = $faults.filter(
			(f) => f.targetType === 'edge' && f.targetId === edgeId && f.status !== 'resolved'
		);
		if (edgeFaults.length === 0) {
			return { hasFault: false, status: null, severity: null, faultCount: 0 };
		}
		const highestSeverity = edgeFaults.some((f) => f.severity === 'critical')
			? 'critical'
			: edgeFaults.some((f) => f.severity === 'major')
				? 'major'
				: 'minor';
		const status = edgeFaults.some((f) => f.status === 'repairing')
			? 'repairing'
			: 'pending';
		return { hasFault: true, status, severity: highestSeverity, faultCount: edgeFaults.length };
	}

	function nodesToElements($nodes: MineNode[], $edges: MineEdge[], $faults: Fault[]): ElementDefinition[] {
		const elements: ElementDefinition[] = [];

		$nodes.forEach((node: MineNode) => {
			const faultInfo = getNodeFaultInfo(node.id, $faults);
			const isBlocked = node.blocked || faultInfo.hasFault;
			let color = getNodeColor(node.type, isBlocked);

			if (faultInfo.hasFault && faultInfo.severity) {
				color = getFaultSeverityColor(faultInfo.severity);
			}

			elements.push({
				data: {
					id: node.id,
					label: node.label,
					type: node.type,
					blocked: isBlocked,
					hasFault: faultInfo.hasFault,
					faultStatus: faultInfo.status,
					faultSeverity: faultInfo.severity,
					faultCount: faultInfo.faultCount,
					color
				},
				position: { x: node.x, y: node.y },
				classes: faultInfo.hasFault ? `fault-node fault-${faultInfo.status}` : ''
			});
		});

		$edges.forEach((edge: MineEdge) => {
			const faultInfo = getEdgeFaultInfo(edge.id, $faults);

			let color = '#374151';
			let width = 3;
			let lineStyle = 'solid';

			if (!edge.enabled || faultInfo.hasFault) {
				color = faultInfo.hasFault && faultInfo.severity
					? getFaultSeverityColor(faultInfo.severity)
					: '#d1d5db';
				lineStyle = faultInfo.status === 'repairing' ? 'dotted' : 'dashed';
				width = faultInfo.hasFault ? 5 : 3;
			} else if (edge.isSwitch) {
				color = edge.switchActive ? '#f59e0b' : '#9ca3af';
				width = 4;
			}

			elements.push({
				data: {
					id: edge.id,
					source: edge.source,
					target: edge.target,
					length: edge.length,
					enabled: edge.enabled && !faultInfo.hasFault,
					isSwitch: edge.isSwitch,
					switchActive: edge.switchActive,
					hasFault: faultInfo.hasFault,
					faultStatus: faultInfo.status,
					faultSeverity: faultInfo.severity,
					color,
					width,
					lineStyle
				},
				classes: faultInfo.hasFault ? `fault-edge fault-${faultInfo.status}` : ''
			});
		});

		return elements;
	}

	function updatePathHighlight($pathResult: PathResultType): void {
		if (!cy) return;

		cy.elements().removeClass('highlighted');
		cy.elements().removeClass('broken');

		if ($pathResult.hasPath) {
			$pathResult.nodes.forEach((nodeId: string) => {
				const node = cy!.$id(nodeId);
				if (node.length > 0) {
					node.addClass('highlighted');
				}
			});
			$pathResult.edges.forEach((edgeId: string) => {
				const edge = cy!.$id(edgeId);
				if (edge.length > 0) {
					edge.addClass('highlighted');
				}
			});
		} else {
			$pathResult.brokenNodes.forEach((nodeId: string) => {
				const node = cy!.$id(nodeId);
				if (node.length > 0) {
					node.addClass('broken');
				}
			});
		}
	}

	let waitingAnimationTimer: number | null = null;
	let waitingBlinkState = false;

	function updatePlaybackCarts(frame: PlaybackFrame | null): void {
		if (!cy) return;

		cy.elements('.cart-node').remove();
		cy.elements('.cart-wait-ring').remove();
		cy.elements('edge').removeClass('congested');

		if (!frame || frame.cartStates.length === 0) return;

		const cartElements: ElementDefinition[] = [];
		const ringElements: ElementDefinition[] = [];

		frame.cartStates.forEach((cartState) => {
			const classes = cartState.isWaiting ? 'cart-node cart-waiting' : 'cart-node';
			cartElements.push({
				group: 'nodes',
				data: {
					id: `cart_${cartState.cartId}`,
					label: cartState.cartName,
					cartColor: cartState.color,
					isCart: true,
					waitRemaining: cartState.waitRemaining,
					waitNodeLabel: cartState.waitNodeLabel
				},
				position: { x: cartState.x, y: cartState.y },
				classes
			});

			if (cartState.isWaiting) {
				ringElements.push({
					group: 'nodes',
					data: {
						id: `cart_ring_${cartState.cartId}`,
						cartColor: cartState.color
					},
					position: { x: cartState.x, y: cartState.y },
					classes: 'cart-wait-ring'
				});
			}
		});

		cy.add(ringElements);
		cy.add(cartElements);

		frame.congestedEdges.forEach((congested) => {
			const edge = cy!.$id(congested.edgeId);
			if (edge.length > 0) {
				edge.addClass('congested');
			}
		});
	}

	const cyStyles = [
		{
			selector: 'node',
			style: {
				'background-color': 'data(color)',
				'border-color': '#1f2937',
				'border-width': 2,
				label: 'data(label)',
				'text-valign': 'center',
				'text-halign': 'center',
				'font-size': 14,
				color: '#ffffff',
				width: 40,
				height: 40,
				'text-outline-width': 2,
				'text-outline-color': '#1f2937'
			}
		},
		{
			selector: 'node:selected',
			style: {
				'border-color': '#8b5cf6',
				'border-width': 4
			}
		},
		{
			selector: 'node.highlighted',
			style: {
				'border-color': '#22c55e',
				'border-width': 4
			}
		},
		{
			selector: 'node.broken',
			style: {
				'border-color': '#ef4444',
				'border-width': 6
			}
		},
		{
			selector: 'edge',
			style: {
				width: 'data(width)',
				'line-color': 'data(color)',
				'line-style': 'data(lineStyle)',
				'curve-style': 'bezier',
				label: 'data(length)',
				'font-size': 10,
				color: '#374151',
				'text-background-color': '#ffffff',
				'text-background-opacity': 0.8,
				'text-background-padding': 2
			}
		},
		{
			selector: 'edge:selected',
			style: {
				'line-color': '#8b5cf6',
				width: 5
			}
		},
		{
			selector: 'edge.highlighted',
			style: {
				'line-color': '#22c55e',
				width: 6
			}
		},
		{
			selector: 'edge.congested',
			style: {
				'line-color': '#ef4444',
				width: 6,
				'line-style': 'solid'
			}
		},
		{
			selector: 'node.cart-node',
			style: {
				'background-color': 'data(cartColor)',
				'border-color': '#1f2937',
				'border-width': 2,
				label: 'data(label)',
				'text-valign': 'bottom',
				'text-halign': 'center',
				'font-size': 10,
				color: '#1f2937',
				width: 24,
				height: 24,
				'text-outline-width': 2,
				'text-outline-color': '#ffffff',
				'z-index': 9999
			}
		},
		{
			selector: 'node.cart-waiting',
			style: {
				'border-color': '#f59e0b',
				'border-width': 3,
				'z-index': 10000
			}
		},
		{
			selector: 'node.cart-wait-ring',
			style: {
				'background-color': 'transparent',
				'border-color': 'data(cartColor)',
				'border-width': 2,
				'border-style': 'dashed',
				width: 42,
				height: 42,
				'z-index': 9998,
				opacity: 0.6
			}
		},
		{
			selector: 'node.fault-node',
			style: {
				'border-width': 4,
				'border-color': '#991b1b',
				width: 50,
				height: 50,
				'z-index': 500
			}
		},
		{
			selector: 'node.fault-blink',
			style: {
				'border-color': '#fecaca',
				'border-width': 6,
				width: 56,
				height: 56
			}
		},
		{
			selector: 'node.repair-blink',
			style: {
				'border-color': '#fde047',
				'border-width': 5,
				width: 52,
				height: 52
			}
		},
		{
			selector: 'edge.fault-edge',
			style: {
				width: 5,
				'z-index': 400
			}
		},
		{
			selector: 'edge.fault-blink',
			style: {
				width: 7,
				opacity: 0.7
			}
		},
		{
			selector: 'edge.repair-blink',
			style: {
				width: 6,
				opacity: 0.8
			}
		}
	];

	let unsubscribeNodes: (() => void) | null = null;
	let unsubscribeEdges: (() => void) | null = null;
	let unsubscribePath: (() => void) | null = null;
	let unsubscribeSelectedNode: (() => void) | null = null;
	let unsubscribeSelectedEdge: (() => void) | null = null;
	let unsubscribeFaults: (() => void) | null = null;
	let faultAnimationTimer: number | null = null;
	let faultBlinkState = false;

	function startFaultAnimation() {
		if (faultAnimationTimer) return;
		faultAnimationTimer = window.setInterval(() => {
			faultBlinkState = !faultBlinkState;
			if (cy) {
				if (faultBlinkState) {
					cy.elements('.fault-pending').addClass('fault-blink');
					cy.elements('.fault-repairing').addClass('repair-blink');
				} else {
					cy.elements('.fault-blink').removeClass('fault-blink');
					cy.elements('.repair-blink').removeClass('repair-blink');
				}
			}
		}, 800);
	}

	function stopFaultAnimation() {
		if (faultAnimationTimer) {
			clearInterval(faultAnimationTimer);
			faultAnimationTimer = null;
		}
	}

	onMount(() => {
		const initialNodes = get(nodesStore);
		const initialEdges = get(edgesStore);
		const initialFaults = get(faultsStore);

		cy = cytoscape({
			container: cyContainer,
			style: cyStyles as unknown as cytoscape.StylesheetJson,
			elements: nodesToElements(initialNodes, initialEdges, initialFaults),
			wheelSensitivity: 0.3,
			minZoom: 0.2,
			maxZoom: 3
		});

		if (initialFaults.length > 0) {
			startFaultAnimation();
		}

		cy.on('tap', 'node', (evt) => {
			const nodeId = evt.target.id();

			if (addMode === 'edge') {
				if (!firstNodeForEdge) {
					firstNodeForEdge = nodeId;
				} else if (firstNodeForEdge !== nodeId) {
					dispatch('addEdge', { source: firstNodeForEdge, target: nodeId });
					firstNodeForEdge = null;
				}
			} else {
				selectedNodeId.set(nodeId);
				selectedEdgeId.set(null);
			}
		});

		cy.on('tap', 'edge', (evt) => {
			if (addMode) return;
			selectedEdgeId.set(evt.target.id());
			selectedNodeId.set(null);
		});

		cy.on('tap', (evt) => {
			if (evt.target === cy) {
				const pos = evt.position;
				if (addMode && addMode !== 'edge') {
					dispatch('addNode', { x: pos.x, y: pos.y, type: addMode as NodeType });
				} else {
					selectedNodeId.set(null);
					selectedEdgeId.set(null);
				}
				firstNodeForEdge = null;
			}
		});

		cy.on('dragfree', 'node', (evt) => {
			const nodeId = evt.target.id();
			const pos = evt.target.position();
			const $nodes = get(nodesStore);
			const node = $nodes.find((n: MineNode) => n.id === nodeId);
			if (node) {
				nodesStore.update((ns: MineNode[]) =>
					ns.map((n: MineNode) => (n.id === nodeId ? { ...n, x: pos.x, y: pos.y } : n))
				);
			}
		});

		function refreshElements() {
			if (!cy) return;
			const $nodes = get(nodesStore);
			const $edges = get(edgesStore);
			const $faults = get(faultsStore);
			cy.elements().remove();
			cy.add(nodesToElements($nodes, $edges, $faults));

			if ($faults.length > 0) {
				startFaultAnimation();
			} else {
				stopFaultAnimation();
			}
		}

		unsubscribeNodes = nodesStore.subscribe(() => {
			refreshElements();
		});

		unsubscribeEdges = edgesStore.subscribe(() => {
			refreshElements();
		});

		unsubscribeFaults = faultsStore.subscribe(($faults: Fault[]) => {
			refreshElements();
		});

		unsubscribePath = pathResult.subscribe(($pathResult: PathResultType) => {
			updatePathHighlight($pathResult);
		});

		unsubscribeSelectedNode = selectedNodeId.subscribe(($id: string | null) => {
			if (!cy) return;
			cy.elements('node').unselect();
			if ($id) {
				const node = cy.$id($id);
				if (node.length > 0) node.select();
			}
		});

		unsubscribeSelectedEdge = selectedEdgeId.subscribe(($id: string | null) => {
			if (!cy) return;
			cy.elements('edge').unselect();
			if ($id) {
				const edge = cy.$id($id);
				if (edge.length > 0) edge.select();
			}
		});

		cy.fit(undefined, 50);
	});

	onDestroy(() => {
		if (unsubscribeNodes) unsubscribeNodes();
		if (unsubscribeEdges) unsubscribeEdges();
		if (unsubscribePath) unsubscribePath();
		if (unsubscribeSelectedNode) unsubscribeSelectedNode();
		if (unsubscribeSelectedEdge) unsubscribeSelectedEdge();
		if (unsubscribeFaults) unsubscribeFaults();
		stopFaultAnimation();
		if (waitingAnimationTimer) clearInterval(waitingAnimationTimer);
		if (cy) cy.destroy();
		cy = null;
	});

	$: if (addMode) {
		firstNodeForEdge = null;
	}

	$: if (cy) {
		updatePlaybackCarts(playbackFrame);
	}
</script>

<div bind:this={cyContainer} id="cy-container" class="w-full min-h-[500px] h-full bg-surface-50 rounded-lg"></div>
