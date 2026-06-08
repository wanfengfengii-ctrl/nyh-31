<script lang="ts">
	import { derived, get } from 'svelte/store';
	import { nodes, selectedNodeId, deleteNode, updateNode, isLabelDuplicate, loadingNodeId, unloadingNodeId } from '$lib/stores';
	import type { NodeType, MineNode } from '$lib/types';

	const selectedNode = derived<[typeof selectedNodeId, typeof nodes], MineNode | null>(
		[selectedNodeId, nodes],
		([$id, $nodes]) => {
			return $nodes.find((n) => n.id === $id) || null;
		}
	);

	let editLabel = '';
	let editType: NodeType = 'normal';
	let editBlocked = false;
	let labelError = '';
	let isUpdating = false;

	$: if ($selectedNode && !isUpdating) {
		editLabel = $selectedNode.label;
		editType = $selectedNode.type;
		editBlocked = $selectedNode.blocked;
		labelError = '';
	}

	function handleLabelInput() {
		if (!$selectedNode) return;
		if (!editLabel.trim()) {
			labelError = '节点编号不能为空';
			return;
		}
		if (isLabelDuplicate(editLabel, $selectedNode.id)) {
			labelError = '节点编号不能重复';
			return;
		}
		labelError = '';
		isUpdating = true;
		updateNode($selectedNode.id, { label: editLabel });
		requestAnimationFrame(() => {
			isUpdating = false;
		});
	}

	function handleLabelKeyup(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleLabelInput();
		}
	}

	function handleTypeChange() {
		if (!$selectedNode) return;
		const oldType = $selectedNode.type;
		isUpdating = true;
		updateNode($selectedNode.id, { type: editType });

		if (oldType !== editType) {
			if (editType === 'loading') {
				loadingNodeId.set($selectedNode.id);
			} else if (oldType === 'loading') {
				const $nodes = get(nodes);
				const otherLoading = $nodes.find((n: MineNode) => n.type === 'loading' && n.id !== $selectedNode?.id);
				if (otherLoading) {
					loadingNodeId.set(otherLoading.id);
				} else {
					loadingNodeId.set('');
				}
			}

			if (editType === 'unloading') {
				unloadingNodeId.set($selectedNode.id);
			} else if (oldType === 'unloading') {
				const $nodes = get(nodes);
				const otherUnloading = $nodes.find((n: MineNode) => n.type === 'unloading' && n.id !== $selectedNode?.id);
				if (otherUnloading) {
					unloadingNodeId.set(otherUnloading.id);
				} else {
					unloadingNodeId.set('');
				}
			}
		}

		requestAnimationFrame(() => {
			isUpdating = false;
		});
	}

	function handleBlockedChange() {
		if (!$selectedNode) return;
		isUpdating = true;
		updateNode($selectedNode.id, { blocked: editBlocked });
		requestAnimationFrame(() => {
			isUpdating = false;
		});
	}

	function handleDelete() {
		if (!$selectedNode) return;
		if (confirm(`确定要删除节点 ${$selectedNode.label} 吗？关联的轨道也会被删除。`)) {
			deleteNode($selectedNode.id);
		}
	}

	const typeOptions: { value: NodeType; label: string }[] = [
		{ value: 'normal', label: '普通节点' },
		{ value: 'loading', label: '装载点' },
		{ value: 'unloading', label: '卸载点' },
		{ value: 'switch', label: '岔道节点' }
	];
</script>

<div class="card p-4 space-y-3">
	<h3 class="text-lg font-bold text-primary-900">节点属性</h3>

	{#if $selectedNode}
		<div class="space-y-3">
			<div>
				<label for="nodeLabel" class="label">节点编号</label>
				<input
					id="nodeLabel"
					type="text"
					class="input {labelError ? 'input-error' : ''}"
					bind:value={editLabel}
					on:input={handleLabelInput}
					on:keyup={handleLabelKeyup}
				/>
				{#if labelError}
					<p class="text-xs text-error-500 mt-1">{labelError}</p>
				{/if}
			</div>

			<div>
				<label for="nodeType" class="label">节点类型</label>
				<select id="nodeType" class="select" bind:value={editType} on:change={handleTypeChange}>
					{#each typeOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<div class="flex items-center gap-2">
				<input type="checkbox" class="checkbox" id="blocked" bind:checked={editBlocked} on:change={handleBlockedChange} />
				<label for="blocked" class="label cursor-pointer">标记为堵塞</label>
			</div>

			<button class="btn btn-sm variant-filled-error w-full" on:click={handleDelete}>
				删除节点
			</button>
		</div>
	{:else}
		<p class="text-sm text-tertiary-500">点击选择一个节点进行编辑</p>
	{/if}
</div>
