<script lang="ts">
	import { derived, get } from 'svelte/store';
	import { nodes, selectedNodeId, deleteNode, updateNode, isLabelDuplicate, loadingNodeId, unloadingNodeId } from '$lib/stores';
	import type { NodeType, MineNode } from '$lib/types';

	const selectedNode = derived<typeof selectedNodeId, MineNode | null>(
		selectedNodeId,
		($id) => {
			const $nodes = get(nodes);
			return $nodes.find((n) => n.id === $id) || null;
		}
	);

	let editLabel = '';
	let editType: NodeType = 'normal';
	let editBlocked = false;
	let labelError = '';

	$: if ($selectedNode) {
		editLabel = $selectedNode.label;
		editType = $selectedNode.type;
		editBlocked = $selectedNode.blocked;
		labelError = '';
	}

	function validateLabel() {
		if (!editLabel.trim()) {
			labelError = '节点编号不能为空';
			return false;
		}
		if (isLabelDuplicate(editLabel, $selectedNode?.id)) {
			labelError = '节点编号不能重复';
			return false;
		}
		labelError = '';
		return true;
	}

	function handleLabelKeyup(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			saveChanges();
		}
	}

	function saveChanges() {
		if (!$selectedNode || !validateLabel()) return;

		const oldType = $selectedNode.type;
		updateNode($selectedNode.id, {
			label: editLabel,
			type: editType,
			blocked: editBlocked
		});

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
					on:blur={validateLabel}
					on:keyup={handleLabelKeyup}
				/>
				{#if labelError}
					<p class="text-xs text-error-500 mt-1">{labelError}</p>
				{/if}
			</div>

			<div>
				<label for="nodeType" class="label">节点类型</label>
				<select id="nodeType" class="select" bind:value={editType}>
					{#each typeOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<div class="flex items-center gap-2">
				<input type="checkbox" class="checkbox" id="blocked" bind:checked={editBlocked} />
				<label for="blocked" class="label cursor-pointer">标记为堵塞</label>
			</div>

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
		<p class="text-sm text-tertiary-500">点击选择一个节点进行编辑</p>
	{/if}
</div>
