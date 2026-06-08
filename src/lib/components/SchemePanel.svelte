<script lang="ts">
	import { get } from 'svelte/store';
	import {
		schemes,
		saveScheme,
		loadScheme,
		deleteScheme,
		currentSchemeName,
		loadingNodeId,
		unloadingNodeId
	} from '$lib/stores';
	import { calculateShortestPath } from '$lib/pathfinding';
	import type { MineScheme, PathResult } from '$lib/types';

	let schemeName = '';
	let showSaveInput = false;
	let showCompare = false;
	let selectedCompareIds = new Set<string>();

	$: schemesSorted = (() => {
		return [...$schemes].sort((a, b) => b.updatedAt - a.updatedAt);
	})();

	interface CompareResult {
		schemeId: string;
		schemeName: string;
		result: PathResult | null;
	}

	let compareResults: CompareResult[] = [];

	$: {
		if (showCompare && selectedCompareIds.size > 0 && $loadingNodeId && $unloadingNodeId) {
			compareResults = $schemes
				.filter((s) => selectedCompareIds.has(s.id))
				.map((scheme) => {
					const loadingNode = scheme.nodes.find((n) => n.id === $loadingNodeId);
					const unloadingNode = scheme.nodes.find((n) => n.id === $unloadingNodeId);
					if (!loadingNode || !unloadingNode) {
						return {
							schemeId: scheme.id,
							schemeName: scheme.name,
							result: null
						};
					}
					return {
						schemeId: scheme.id,
						schemeName: scheme.name,
						result: calculateShortestPath(
							scheme.nodes,
							scheme.edges,
							$loadingNodeId,
							$unloadingNodeId
						)
					};
				});
		} else {
			compareResults = [];
		}
	}

	function toggleCompare(schemeId: string) {
		const newSet = new Set(selectedCompareIds);
		if (newSet.has(schemeId)) {
			newSet.delete(schemeId);
		} else {
			newSet.add(schemeId);
		}
		selectedCompareIds = newSet;
	}

	function handleSave() {
		if (!schemeName.trim()) {
			const $schemes = get(schemes);
			schemeName = `方案 ${$schemes.length + 1}`;
		}
		saveScheme(schemeName.trim());
		schemeName = '';
		showSaveInput = false;
	}

	function handleSaveKeyup(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSave();
		}
	}

	function handleLoad(id: string) {
		loadScheme(id);
	}

	function handleDelete(id: string, name: string) {
		if (confirm(`确定要删除方案「${name}」吗？`)) {
			deleteScheme(id);
			selectedCompareIds.delete(id);
			selectedCompareIds = new Set(selectedCompareIds);
		}
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleString('zh-CN', {
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="card p-4 space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-bold text-primary-900">方案管理</h3>
		<div class="flex gap-1">
			<button
				class="btn btn-sm variant-soft-secondary"
				class:variant-filled-secondary={showCompare}
				on:click={() => (showCompare = !showCompare)}
				disabled={$schemes.length < 2}
			>
				对比
			</button>
			<button
				class="btn btn-sm variant-filled-primary"
				on:click={() => (showSaveInput = !showSaveInput)}
			>
				{showSaveInput ? '取消' : '保存方案'}
			</button>
		</div>
	</div>

	<div>
		<p class="text-sm text-tertiary-600">
			当前方案: <span class="font-medium text-primary-700">{$currentSchemeName}</span>
		</p>
	</div>

	{#if showSaveInput}
		<div class="flex gap-2">
			<input
				type="text"
				class="input flex-1"
				placeholder="方案名称"
				bind:value={schemeName}
				on:keyup={handleSaveKeyup}
			/>
			<button class="btn btn-sm variant-filled-success" on:click={handleSave}>
				保存
			</button>
		</div>
	{/if}

	{#if showCompare && compareResults.length > 0}
		<div class="bg-primary-50 p-3 rounded-lg">
			<p class="text-sm font-medium text-primary-700 mb-2">
				方案对比（基于当前装载/卸载点）
			</p>
			<div class="overflow-x-auto">
				<table class="table table-compact w-full text-xs">
					<thead>
						<tr>
							<th>方案名</th>
							<th class="text-right">距离</th>
							<th class="text-right">岔道</th>
							<th class="text-right">节点</th>
							<th>状态</th>
						</tr>
					</thead>
					<tbody>
						{#each compareResults as cr (cr.schemeId)}
							<tr>
								<td class="font-medium">{cr.schemeName}</td>
								{#if cr.result?.hasPath}
									<td class="text-right">{cr.result.totalDistance}</td>
									<td class="text-right text-amber-600">{cr.result.switchCount}</td>
									<td class="text-right">{cr.result.nodes.length}</td>
									<td><span class="text-success-600">✓ 可达</span></td>
								{:else}
									<td class="text-right text-tertiary-400">-</td>
									<td class="text-right text-tertiary-400">-</td>
									<td class="text-right text-tertiary-400">-</td>
									<td><span class="text-error-600">✗ 不可达</span></td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-xs text-tertiary-500 mt-2">
				提示: 勾选下方方案进行对比
			</p>
		</div>
	{/if}

	<hr class="my-2" />

	<div class="space-y-2 max-h-60 overflow-y-auto">
		{#if schemesSorted.length === 0}
			<p class="text-sm text-tertiary-500 text-center py-4">暂无保存的方案</p>
		{:else}
			{#each schemesSorted as scheme (scheme.id)}
				<div
					class="p-2 rounded border border-surface-300 hover:bg-surface-50 transition-colors"
					class:border-primary-400={scheme.name === $currentSchemeName}
					class:bg-primary-50={scheme.name === $currentSchemeName}
				>
					<div class="flex items-center gap-2">
						{#if showCompare}
							<input
								type="checkbox"
								class="checkbox"
								checked={selectedCompareIds.has(scheme.id)}
								on:change={() => toggleCompare(scheme.id)}
							/>
						{/if}
						<div class="flex-1 min-w-0">
							<div class="flex items-center justify-between">
								<span class="font-medium text-sm truncate">{scheme.name}</span>
								<span class="text-xs text-tertiary-500 flex-shrink-0">
									{formatDate(scheme.updatedAt)}
								</span>
							</div>
							<div class="text-xs text-tertiary-500 mt-1">
								{scheme.nodes.length} 个节点 · {scheme.edges.length} 条轨道
							</div>
						</div>
					</div>
					<div class="flex gap-1 mt-2">
						<button
							class="btn btn-xs variant-soft-primary flex-1"
							on:click={() => handleLoad(scheme.id)}
						>
							加载
						</button>
						<button
							class="btn btn-xs variant-soft-error"
							on:click={() => handleDelete(scheme.id, scheme.name)}
						>
							删除
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
