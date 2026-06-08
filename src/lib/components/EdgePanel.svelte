<script lang="ts">
	import { derived, get } from 'svelte/store';
	import { edges, nodes, selectedEdgeId, updateEdge, deleteEdge, toggleSwitch } from '$lib/stores';
	import type { MineEdge, MineNode } from '$lib/types';

	interface SelectedEdgeInfo {
		edge: MineEdge;
		sourceLabel: string;
		targetLabel: string;
	}

	const selectedEdge = derived<typeof selectedEdgeId, SelectedEdgeInfo | null>(
		selectedEdgeId,
		($id) => {
			const $edges = get(edges);
			const $nodes = get(nodes);
			const edge = $edges.find((e: MineEdge) => e.id === $id);
			if (!edge) return null;
			const source = $nodes.find((n: MineNode) => n.id === edge.source);
			const target = $nodes.find((n: MineNode) => n.id === edge.target);
			return {
				edge,
				sourceLabel: source?.label || '?',
				targetLabel: target?.label || '?'
			};
		}
	);

	let editLength = 50;
	let lengthError = '';

	$: if ($selectedEdge) {
		editLength = $selectedEdge.edge.length;
		lengthError = '';
	}

	function validateLength() {
		const val = Number(editLength);
		if (isNaN(val) || val <= 0) {
			lengthError = '轨道长度必须大于 0';
			return false;
		}
		lengthError = '';
		return true;
	}

	function saveChanges() {
		if (!$selectedEdge || !validateLength()) return;
		updateEdge($selectedEdge.edge.id, {
			length: Number(editLength)
		});
	}

	function toggleEnabled() {
		if (!$selectedEdge) return;
		updateEdge($selectedEdge.edge.id, {
			enabled: !$selectedEdge.edge.enabled
		});
	}

	function toggleIsSwitch() {
		if (!$selectedEdge) return;
		updateEdge($selectedEdge.edge.id, {
			isSwitch: !$selectedEdge.edge.isSwitch,
			switchActive: !$selectedEdge.edge.isSwitch ? true : $selectedEdge.edge.switchActive
		});
	}

	function handleToggleSwitch() {
		if (!$selectedEdge) return;
		toggleSwitch($selectedEdge.edge.id);
	}

	function handleDelete() {
		if (!$selectedEdge) return;
		if (confirm('确定要删除这条轨道吗？')) {
			deleteEdge($selectedEdge.edge.id);
		}
	}
</script>

<div class="card p-4 space-y-3">
	<h3 class="text-lg font-bold text-primary-900">轨道属性</h3>

	{#if $selectedEdge}
		<div class="space-y-3">
			<p class="text-sm text-tertiary-600">
				节点 {$selectedEdge.sourceLabel} → {$selectedEdge.targetLabel}
			</p>

			<div>
				<label for="edgeLength" class="label">轨道长度</label>
				<input
					id="edgeLength"
					type="number"
					class="input {lengthError ? 'input-error' : ''}"
					bind:value={editLength}
					min="1"
					on:blur={validateLength}
				/>
				{#if lengthError}
					<p class="text-xs text-error-500 mt-1">{lengthError}</p>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<input
					type="checkbox"
					class="checkbox"
					id="edgeEnabled"
					checked={$selectedEdge.edge.enabled}
					on:change={toggleEnabled}
				/>
				<label for="edgeEnabled" class="label cursor-pointer">启用轨道</label>
			</div>

			<div class="flex items-center gap-2">
				<input
					type="checkbox"
					class="checkbox"
					id="isSwitch"
					checked={$selectedEdge.edge.isSwitch}
					on:change={toggleIsSwitch}
				/>
				<label for="isSwitch" class="label cursor-pointer">是岔道开关</label>
			</div>

			{#if $selectedEdge.edge.isSwitch}
				<div class="p-2 bg-warning-50 rounded">
					<div class="flex items-center justify-between">
						<span class="text-sm">岔道状态:</span>
						<span
							class:text-warning-700={$selectedEdge.edge.switchActive}
							class:text-gray-500={!$selectedEdge.edge.switchActive}
							class="font-medium"
						>
							{$selectedEdge.edge.switchActive ? '开启' : '关闭'}
						</span>
					</div>
					<button
						class="btn btn-sm variant-filled-warning w-full mt-2"
						on:click={handleToggleSwitch}
						disabled={!$selectedEdge.edge.enabled}
					>
						切换岔道状态
					</button>
				</div>
			{/if}

			<div class="flex gap-2">
				<button class="btn btn-sm variant-filled-primary flex-1" on:click={saveChanges}>
					保存
				</button>
				<button class="btn btn-sm variant-filled-error" on:click={handleDelete}>
					删除
				</button>
			</div>
		</div>
	{:else}
		<p class="text-sm text-tertiary-500">点击选择一条轨道进行编辑</p>
	{/if}
</div>
