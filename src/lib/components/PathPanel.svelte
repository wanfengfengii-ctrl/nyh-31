<script lang="ts">
	import { derived, get } from 'svelte/store';
	import { pathResult, nodes, loadingNodeId, unloadingNodeId } from '$lib/stores';
	import type { MineNode } from '$lib/types';

	const loadingNode = derived(loadingNodeId, ($id) => {
		const $nodes = get(nodes);
		return $nodes.find((n: MineNode) => n.id === $id);
	});

	const unloadingNode = derived(unloadingNodeId, ($id) => {
		const $nodes = get(nodes);
		return $nodes.find((n: MineNode) => n.id === $id);
	});

	function getNodeLabel(nodeId: string): string {
		const node = get(nodes).find((n: MineNode) => n.id === nodeId);
		return node?.label || nodeId;
	}
</script>

<div class="card p-4 space-y-3">
	<h3 class="text-lg font-bold text-primary-900">路径信息</h3>

	<div class="text-sm space-y-1">
		<div class="flex justify-between">
			<span class="text-tertiary-600">装载点:</span>
			<span class="font-medium text-green-600">{$loadingNode?.label || '未设置'}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-tertiary-600">卸载点:</span>
			<span class="font-medium text-blue-600">{$unloadingNode?.label || '未设置'}</span>
		</div>
	</div>

	<hr class="my-2" />

	{#if $pathResult.hasPath}
		<div class="space-y-2">
			<div class="bg-success-50 p-3 rounded-lg">
				<p class="text-success-700 font-medium text-sm">✓ 找到可行路线</p>
			</div>

			<div class="text-sm space-y-1">
				<div class="flex justify-between">
					<span class="text-tertiary-600">总距离:</span>
					<span class="font-bold">{$pathResult.totalDistance}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-tertiary-600">经过岔道数:</span>
					<span class="font-bold text-amber-600">{$pathResult.switchCount}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-tertiary-600">经过节点数:</span>
					<span class="font-bold">{$pathResult.nodes.length}</span>
				</div>
			</div>

			<div>
				<p class="text-sm text-tertiary-600 mb-1">路径节点:</p>
				<div class="flex flex-wrap gap-1">
					{#each $pathResult.nodes as nodeId, index}
						<span class="px-2 py-1 bg-surface-200 rounded text-xs">
							{getNodeLabel(nodeId)}
						</span>
						{#if index < $pathResult.nodes.length - 1}
							<span class="text-tertiary-400">→</span>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	{:else}
		<div class="space-y-2">
			<div class="bg-error-50 p-3 rounded-lg">
				<p class="text-error-700 font-medium text-sm">✗ 无可行路线</p>
			</div>

			{#if $pathResult.brokenNodes.length > 0}
				<div>
					<p class="text-sm text-tertiary-600 mb-1">断点节点:</p>
					<div class="flex flex-wrap gap-1">
						{#each $pathResult.brokenNodes as nodeId}
							<span class="px-2 py-1 bg-error-100 text-error-700 rounded text-xs">
								{getNodeLabel(nodeId)}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if $pathResult.blockedNodes.length > 0}
		<hr class="my-2" />
		<div>
			<p class="text-sm text-tertiary-600 mb-1">堵塞节点:</p>
			<div class="flex flex-wrap gap-1">
				{#each $pathResult.blockedNodes as nodeId}
					<span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
						{getNodeLabel(nodeId)}
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
