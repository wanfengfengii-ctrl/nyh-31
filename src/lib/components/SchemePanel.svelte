<script lang="ts">
	import { derived, get } from 'svelte/store';
	import { schemes, saveScheme, loadScheme, deleteScheme, currentSchemeName } from '$lib/stores';
	import type { MineScheme } from '$lib/types';

	let schemeName = '';
	let showSaveInput = false;

	const schemesSorted = derived<typeof schemes, MineScheme[]>(
		schemes,
		($schemes) => {
			return [...$schemes].sort((a, b) => b.updatedAt - a.updatedAt);
		}
	);

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
		<button
			class="btn btn-sm variant-filled-primary"
			on:click={() => (showSaveInput = !showSaveInput)}
		>
			{showSaveInput ? '取消' : '保存方案'}
		</button>
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

	<hr class="my-2" />

	<div class="space-y-2 max-h-60 overflow-y-auto">
		{#if $schemesSorted.length === 0}
			<p class="text-sm text-tertiary-500 text-center py-4">暂无保存的方案</p>
		{:else}
			{#each $schemesSorted as scheme (scheme.id)}
				<div
					class="p-2 rounded border border-surface-300 hover:bg-surface-50 transition-colors"
					class:border-primary-400={scheme.name === $currentSchemeName}
					class:bg-primary-50={scheme.name === $currentSchemeName}
				>
					<div class="flex items-center justify-between">
						<span class="font-medium text-sm">{scheme.name}</span>
						<span class="text-xs text-tertiary-500">{formatDate(scheme.updatedAt)}</span>
					</div>
					<div class="text-xs text-tertiary-500 mt-1">
						{scheme.nodes.length} 个节点 · {scheme.edges.length} 条轨道
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
