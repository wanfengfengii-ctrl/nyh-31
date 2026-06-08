<script lang="ts">
	import type { NodeType } from '$lib/types';

	export let addMode: NodeType | 'edge' | null = null;

	function setMode(mode: NodeType | 'edge' | null) {
		addMode = addMode === mode ? null : mode;
	}

	function getButtonClass(mode: NodeType | 'edge'): string {
		const base = 'btn btn-sm ';
		if (addMode !== mode) return base + 'variant-soft';
		switch (mode) {
			case 'normal':
			case 'unloading':
				return base + 'variant-filled-primary';
			case 'loading':
				return base + 'variant-filled-success';
			case 'switch':
				return base + 'variant-filled-warning';
			case 'edge':
				return base + 'variant-filled-surface';
			default:
				return base + 'variant-soft';
		}
	}

	const tools: { mode: NodeType | 'edge'; label: string; icon: string }[] = [
		{ mode: 'normal', label: '普通节点', icon: '●' },
		{ mode: 'loading', label: '装载点', icon: '⬆' },
		{ mode: 'unloading', label: '卸载点', icon: '⬇' },
		{ mode: 'switch', label: '岔道节点', icon: '◈' },
		{ mode: 'edge', label: '轨道边', icon: '━' }
	];
</script>

<div class="card p-4 space-y-3">
	<h3 class="text-lg font-bold text-primary-900">绘图工具</h3>
	<div class="grid grid-cols-2 gap-2">
		{#each tools as tool}
			<button
				class={getButtonClass(tool.mode)}
				on:click={() => setMode(tool.mode)}
			>
				<span class="mr-1">{tool.icon}</span>
				{tool.label}
			</button>
		{/each}
	</div>
	<button class="btn btn-sm variant-ghost-danger w-full" on:click={() => setMode(null)}>
		取消选择
	</button>
	<p class="text-xs text-tertiary-500 mt-2">
		{#if addMode === 'edge'}
			点击两个节点来创建轨道边
		{:else if addMode}
			点击画布添加{tools.find((t) => t.mode === addMode)?.label}
		{:else}
			选择工具开始绘制
		{/if}
	</p>
</div>
