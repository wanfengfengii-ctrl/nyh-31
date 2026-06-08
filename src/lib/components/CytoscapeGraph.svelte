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
		pathResult
	} from '$lib/stores';
	import type {
		MineNode,
		MineEdge,
		NodeType,
		PathResult as PathResultType,
		PlaybackFrame
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

	function nodesToElements($nodes: MineNode[], $edges: MineEdge[]): ElementDefinition[] {
		const elements: ElementDefinition[] = [];

		$nodes.forEach((node: MineNode) => {
			elements.push({
				data: {
					id: node.id,
					label: node.label,
					type: node.type,
					blocked: node.blocked,
					color: getNodeColor(node.type, node.blocked)
				},
				position: { x: node.x, y: node.y }
			});
		});

		$edges.forEach((edge: MineEdge) => {
			let color = '#374151';
			let width = 3;
			let lineStyle = 'solid';

			if (!edge.enabled) {
				color = '#d1d5db';
				lineStyle = 'dashed';
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
					enabled: edge.enabled,
					isSwitch: edge.isSwitch,
					switchActive: edge.switchActive,
					color,
					width,
					lineStyle
				}
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

	function updatePlaybackCarts(frame: PlaybackFrame | null): void {
		if (!cy) return;

		cy.elements('.cart-node').remove();
		cy.elements('edge').removeClass('congested');

		if (!frame || frame.cartStates.length === 0) return;

		const cartElements: ElementDefinition[] = frame.cartStates.map((cartState) => ({
			group: 'nodes',
			data: {
				id: `cart_${cartState.cartId}`,
				label: cartState.cartName,
				cartColor: cartState.color,
				isCart: true
			},
			position: { x: cartState.x, y: cartState.y },
			classes: 'cart-node'
		}));

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
		}
	];

	let unsubscribeNodes: (() => void) | null = null;
	let unsubscribeEdges: (() => void) | null = null;
	let unsubscribePath: (() => void) | null = null;
	let unsubscribeSelectedNode: (() => void) | null = null;
	let unsubscribeSelectedEdge: (() => void) | null = null;

	onMount(() => {
		const initialNodes = get(nodesStore);
		const initialEdges = get(edgesStore);

		cy = cytoscape({
			container: cyContainer,
			style: cyStyles as unknown as cytoscape.StylesheetJson,
			elements: nodesToElements(initialNodes, initialEdges),
			wheelSensitivity: 0.3,
			minZoom: 0.2,
			maxZoom: 3
		});

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

		unsubscribeNodes = nodesStore.subscribe(($nodes: MineNode[]) => {
			if (!cy) return;
			const $edges = get(edgesStore);
			cy.elements().remove();
			cy.add(nodesToElements($nodes, $edges));
		});

		unsubscribeEdges = edgesStore.subscribe(($edges: MineEdge[]) => {
			if (!cy) return;
			const $nodes = get(nodesStore);
			cy.elements().remove();
			cy.add(nodesToElements($nodes, $edges));
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
