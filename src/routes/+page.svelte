<script lang="ts">
	import { onMount } from 'svelte';
	import CytoscapeGraph from '$lib/components/CytoscapeGraph.svelte';
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import NodePanel from '$lib/components/NodePanel.svelte';
	import EdgePanel from '$lib/components/EdgePanel.svelte';
	import PathPanel from '$lib/components/PathPanel.svelte';
	import SchemePanel from '$lib/components/SchemePanel.svelte';
	import DispatchPanel from '$lib/components/DispatchPanel.svelte';
	import PlaybackPanel from '$lib/components/PlaybackPanel.svelte';
	import { addNode, addEdge, initDefaultCarts } from '$lib/stores';
	import type { NodeType, PlaybackFrame } from '$lib/types';

	let addMode: NodeType | 'edge' | null = null;
	let playbackFrame: PlaybackFrame | null = null;
	let showDispatchCenter = false;

	onMount(() => {
		initDefaultCarts();
	});

	function handleAddNode(event: CustomEvent<{ x: number; y: number; type: NodeType }>) {
		const { x, y, type } = event.detail;
		addNode(x, y, type);
	}

	function handleAddEdge(event: CustomEvent<{ source: string; target: string }>) {
		const { source, target } = event.detail;
		addEdge(source, target, 50);
	}

	function handleFrameChange(event: CustomEvent<PlaybackFrame>) {
		playbackFrame = event.detail;
	}
</script>

<div class="min-h-screen bg-surface-200 flex flex-col">
	<header class="bg-surface-900 text-surface-50 px-6 py-4 shadow-lg flex-shrink-0">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold text-primary-400">⛏ 老矿洞轨道模拟系统</h1>
				<p class="text-sm text-surface-400">绘制矿洞轨道 · 计算运输路线 · 分析堵塞风险</p>
			</div>
			<div class="flex items-center gap-4">
				<button
					class="btn btn-sm"
					class:variant-filled-primary={showDispatchCenter}
					class:variant-soft-secondary={!showDispatchCenter}
					on:click={() => (showDispatchCenter = !showDispatchCenter)}
				>
					🚚 调度中心
				</button>
				<div class="text-sm text-surface-400 text-right">
					<p>节点编号不能重复</p>
					<p>轨道长度必须大于 0</p>
				</div>
			</div>
		</div>
	</header>

	<div class="flex flex-1 overflow-hidden">
		<aside class="w-72 bg-surface-100 border-r border-surface-300 p-4 space-y-4 overflow-y-auto flex-shrink-0">
			<ToolPanel bind:addMode />
			<NodePanel />
			<EdgePanel />
		</aside>

		<main class="flex-1 p-4 min-w-0">
			<div class="w-full h-full bg-white rounded-xl shadow-md overflow-hidden">
				<CytoscapeGraph
					{addMode}
					{playbackFrame}
					on:addNode={handleAddNode}
					on:addEdge={handleAddEdge}
				/>
			</div>
		</main>

		<aside class="w-80 bg-surface-100 border-l border-surface-300 p-4 space-y-4 overflow-y-auto flex-shrink-0">
			{#if !showDispatchCenter}
				<PathPanel />
				<SchemePanel />

				<div class="card p-4 space-y-2">
					<h3 class="text-lg font-bold text-primary-900">图例说明</h3>
					<div class="space-y-2 text-sm">
						<div class="flex items-center gap-2">
							<div class="w-5 h-5 rounded-full bg-green-500 border-2 border-gray-800"></div>
							<span>装载点</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-5 h-5 rounded-full bg-blue-500 border-2 border-gray-800"></div>
							<span>卸载点</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-5 h-5 rounded-full bg-amber-500 border-2 border-gray-800"></div>
							<span>岔道节点</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-5 h-5 rounded-full bg-gray-500 border-2 border-gray-800"></div>
							<span>普通节点</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-5 h-5 rounded-full bg-red-500 border-2 border-gray-800"></div>
							<span>堵塞节点</span>
						</div>
						<hr class="my-2" />
						<div class="flex items-center gap-2">
							<div class="w-8 h-1 bg-gray-700"></div>
							<span>普通轨道</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-8 h-1 bg-amber-500"></div>
							<span>岔道（开启）</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-8 h-0.5 bg-gray-300 border-t border-dashed"></div>
							<span>关闭轨道</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-8 h-1 bg-green-500"></div>
							<span>最短路径</span>
						</div>
					</div>
				</div>
			{:else}
				<DispatchPanel />
				<PlaybackPanel on:frameChange={handleFrameChange} />

				<div class="card p-4 space-y-2">
					<h3 class="text-lg font-bold text-primary-900">调度图例</h3>
					<div class="space-y-2 text-sm">
						<div class="flex items-center gap-2">
							<div class="w-5 h-5 rounded-full bg-red-500 border-2 border-gray-800"></div>
							<span>1号矿车</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-5 h-5 rounded-full bg-blue-500 border-2 border-gray-800"></div>
							<span>2号矿车</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-5 h-5 rounded-full bg-green-500 border-2 border-gray-800"></div>
							<span>3号矿车</span>
						</div>
						<hr class="my-2" />
						<div class="flex items-center gap-2">
							<div class="w-8 h-1.5 bg-red-500"></div>
							<span>拥堵轨道</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="w-8 h-1 bg-green-500"></div>
							<span>空闲轨道</span>
						</div>
					</div>
				</div>
			{/if}
		</aside>
	</div>
</div>
