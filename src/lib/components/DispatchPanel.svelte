<script lang="ts">
	import { get } from 'svelte/store';
	import {
		carts,
		dispatchResult,
		addCart,
		updateCart,
		deleteCart,
		loadingNodeId,
		unloadingNodeId,
		nodes,
		edges,
		dispatchSchemes,
		currentDispatchSchemeName,
		saveDispatchScheme,
		loadDispatchScheme,
		deleteDispatchScheme
	} from '$lib/stores';
	import { calculateDispatch } from '$lib/dispatch';
	import type { Cart, Conflict, DispatchResult } from '$lib/types';

	let activeTab: 'config' | 'results' | 'compare' = 'config';
	let showSaveInput = false;
	let schemeName = '';
	let selectedCompareIds = new Set<string>();

	$: nodesArray = $nodes;
	$: result = $dispatchResult;

	$: sortedConflicts = [...result.conflicts].sort((a, b) => {
		const severityOrder = { high: 0, medium: 1, low: 2 };
		return severityOrder[a.severity] - severityOrder[b.severity];
	});

	$: dispatchSchemesSorted = [...$dispatchSchemes].sort((a, b) => b.updatedAt - a.updatedAt);

	function getSeverityColor(severity: Conflict['severity']): string {
		switch (severity) {
			case 'high':
				return 'text-error-600 bg-error-50';
			case 'medium':
				return 'text-warning-600 bg-warning-50';
			case 'low':
				return 'text-info-600 bg-info-50';
			default:
				return 'text-tertiary-600 bg-surface-50';
		}
	}

	function getSeverityLabel(severity: Conflict['severity']): string {
		switch (severity) {
			case 'high':
				return '高风险';
			case 'medium':
				return '中风险';
			case 'low':
				return '低风险';
			default:
				return '未知';
		}
	}

	function getTypeLabel(type: Conflict['type']): string {
		switch (type) {
			case 'edge':
				return '轨道冲突';
			case 'node':
				return '节点冲突';
			case 'switch':
				return '岔道冲突';
			default:
				return '未知冲突';
		}
	}

	function getCongestionRiskLevel(risk: number): { label: string; color: string } {
		if (risk >= 70) return { label: '高拥堵', color: 'text-error-600' };
		if (risk >= 40) return { label: '中拥堵', color: 'text-warning-600' };
		if (risk > 0) return { label: '低拥堵', color: 'text-info-600' };
		return { label: '畅通', color: 'text-success-600' };
	}

	function handleAddCart() {
		addCart();
	}

	function handleDeleteCart(cartId: string) {
		deleteCart(cartId);
	}

	function handleUpdateCart(cartId: string, updates: Partial<Cart>) {
		updateCart(cartId, updates);
	}

	function onCartNameChange(cartId: string, event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		updateCart(cartId, { name: target.value });
	}

	function onCartSourceChange(cartId: string, event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		updateCart(cartId, { sourceId: target.value });
	}

	function onCartTargetChange(cartId: string, event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		updateCart(cartId, { targetId: target.value });
	}

	function onCartDepartureChange(cartId: string, event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		updateCart(cartId, { departureTime: parseFloat(target.value) || 0 });
	}

	function onCartPriorityChange(cartId: string, event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		updateCart(cartId, { priority: parseInt(target.value) });
	}

	function onCartSpeedChange(cartId: string, event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		updateCart(cartId, { speed: parseFloat(target.value) || 1 });
	}

	function onCartColorChange(cartId: string, event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		updateCart(cartId, { color: target.value });
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
			const $schemes = get(dispatchSchemes);
			schemeName = `调度方案 ${$schemes.length + 1}`;
		}
		saveDispatchScheme(schemeName.trim());
		schemeName = '';
		showSaveInput = false;
	}

	function handleSaveKeyup(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSave();
		}
	}

	function handleLoad(id: string) {
		loadDispatchScheme(id);
		activeTab = 'config';
	}

	function handleDelete(id: string, name: string) {
		if (confirm(`确定要删除调度方案「${name}」吗？`)) {
			deleteDispatchScheme(id);
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

	$: compareResults = (() => {
		if (selectedCompareIds.size === 0) return [];
		const currentNodes = get(nodes);
		const currentEdges = get(edges);
		return $dispatchSchemes
			.filter((s) => selectedCompareIds.has(s.id))
			.map((scheme) => {
				const tempResult = calculateDispatch(currentNodes, currentEdges, scheme.carts);
				return {
					schemeId: scheme.id,
					schemeName: scheme.name,
					result: tempResult
				};
			});
	})();
</script>

<div class="card p-4 space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-bold text-primary-900">🚚 多小车调度中心</h3>
	</div>

	<div class="flex gap-1 text-sm">
		<button
			class="btn btn-xs flex-1"
			class:variant-filled-primary={activeTab === 'config'}
			class:variant-soft={activeTab !== 'config'}
			on:click={() => (activeTab = 'config')}
		>
			车辆配置
		</button>
		<button
			class="btn btn-xs flex-1"
			class:variant-filled-primary={activeTab === 'results'}
			class:variant-soft={activeTab !== 'results'}
			on:click={() => (activeTab = 'results')}
		>
			调度结果
		</button>
		<button
			class="btn btn-xs flex-1"
			class:variant-filled-primary={activeTab === 'compare'}
			class:variant-soft={activeTab !== 'compare'}
			on:click={() => (activeTab = 'compare')}
		>
			方案对比
		</button>
	</div>

	{#if activeTab === 'config'}
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-sm text-tertiary-600">
					当前方案: <span class="font-medium text-primary-700">{$currentDispatchSchemeName}</span>
				</span>
				<div class="flex gap-1">
					<button
						class="btn btn-xs variant-soft-secondary"
						on:click={() => (showSaveInput = !showSaveInput)}
					>
						{showSaveInput ? '取消' : '保存'}
					</button>
					<button class="btn btn-xs variant-filled-primary" on:click={handleAddCart}>
						+ 添加小车
					</button>
				</div>
			</div>

			{#if showSaveInput}
				<div class="flex gap-2">
					<input
						type="text"
						class="input flex-1 text-sm"
						placeholder="方案名称"
						bind:value={schemeName}
						on:keyup={handleSaveKeyup}
					/>
					<button class="btn btn-xs variant-filled-success" on:click={handleSave}>
						保存
					</button>
				</div>
			{/if}

			<div class="space-y-2 max-h-64 overflow-y-auto">
				{#if $carts.length === 0}
					<p class="text-sm text-tertiary-500 text-center py-4">暂无小车，请添加</p>
				{:else}
					{#each $carts as cart (cart.id)}
						<div class="p-3 rounded-lg border border-surface-300 bg-surface-50 space-y-2">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<div
										class="w-4 h-4 rounded-full border-2 border-gray-700"
										style="background-color: {cart.color}"
									></div>
									<input
										type="text"
										class="input input-sm w-24 font-medium text-sm"
										value={cart.name}
										on:change={(e) => onCartNameChange(cart.id, e)}
									/>
								</div>
								<button
									class="btn btn-xs variant-ghost-error"
									on:click={() => handleDeleteCart(cart.id)}
								>
									删除
								</button>
							</div>

							<div class="grid grid-cols-2 gap-2 text-xs">
								<div>
									<span class="text-tertiary-500">起点</span>
									<select
										class="input input-sm w-full"
										value={cart.sourceId}
										on:change={(e) => onCartSourceChange(cart.id, e)}
									>
										{#each nodesArray as node (node.id)}
											<option value={node.id}>{node.label}</option>
										{/each}
									</select>
								</div>
								<div>
									<span class="text-tertiary-500">终点</span>
									<select
										class="input input-sm w-full"
										value={cart.targetId}
										on:change={(e) => onCartTargetChange(cart.id, e)}
									>
										{#each nodesArray as node (node.id)}
											<option value={node.id}>{node.label}</option>
										{/each}
									</select>
								</div>
								<div>
									<span class="text-tertiary-500">发车时间</span>
									<input
										type="number"
										class="input input-sm w-full"
										min="0"
										step="1"
										value={cart.departureTime}
										on:change={(e) => onCartDepartureChange(cart.id, e)}
									/>
								</div>
								<div>
									<span class="text-tertiary-500">优先级</span>
									<select
										class="input input-sm w-full"
										value={cart.priority}
										on:change={(e) => onCartPriorityChange(cart.id, e)}
									>
										<option value={3}>高 (3)</option>
										<option value={2}>中 (2)</option>
										<option value={1}>低 (1)</option>
									</select>
								</div>
								<div>
									<span class="text-tertiary-500">速度</span>
									<input
										type="number"
										class="input input-sm w-full"
										min="1"
										step="1"
										value={cart.speed}
										on:change={(e) => onCartSpeedChange(cart.id, e)}
									/>
								</div>
								<div>
									<span class="text-tertiary-500">颜色</span>
									<input
										type="color"
										class="input input-sm w-full h-8 p-0.5"
										value={cart.color}
										on:change={(e) => onCartColorChange(cart.id, e)}
									/>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<hr class="my-2" />

		<div class="space-y-2">
			<p class="text-sm font-medium text-primary-700">已保存的调度方案</p>
			<div class="space-y-1 max-h-32 overflow-y-auto">
				{#if dispatchSchemesSorted.length === 0}
					<p class="text-xs text-tertiary-500 text-center py-2">暂无保存的方案</p>
				{:else}
					{#each dispatchSchemesSorted as scheme (scheme.id)}
						<div
							class="p-2 rounded border border-surface-300 hover:bg-surface-100 transition-colors flex items-center justify-between"
							class:border-primary-400={scheme.name === $currentDispatchSchemeName}
							class:bg-primary-50={scheme.name === $currentDispatchSchemeName}
						>
							<div class="flex-1 min-w-0">
								<span class="text-sm font-medium truncate">{scheme.name}</span>
								<span class="text-xs text-tertiary-500 ml-2">
									{scheme.carts.length} 辆
								</span>
							</div>
							<div class="flex gap-1">
								<button
									class="btn btn-xs variant-soft-primary"
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
	{/if}

	{#if activeTab === 'results'}
		<div class="space-y-3">
			<div class="grid grid-cols-2 gap-2">
				<div class="bg-primary-50 p-2 rounded-lg">
					<p class="text-xs text-tertiary-600">总运输时长</p>
					<p class="text-lg font-bold text-primary-700">
						{result.totalTime.toFixed(1)}
						<span class="text-xs font-normal text-tertiary-500"> 单位时间</span>
					</p>
				</div>
				<div class="bg-success-50 p-2 rounded-lg">
					<p class="text-xs text-tertiary-600">总运输距离</p>
					<p class="text-lg font-bold text-success-700">
						{result.totalDistance.toFixed(0)}
						<span class="text-xs font-normal text-tertiary-500"> 米</span>
					</p>
				</div>
				<div class="bg-warning-50 p-2 rounded-lg">
					<p class="text-xs text-tertiary-600">岔道切换</p>
					<p class="text-lg font-bold text-warning-700">
						{result.totalSwitchCount}
						<span class="text-xs font-normal text-tertiary-500"> 次</span>
					</p>
				</div>
				<div class="p-2 rounded-lg" class:bg-error-50={result.congestionRisk >= 40} class:bg-info-50={result.congestionRisk < 40 && result.congestionRisk > 0} class:bg-success-50={result.congestionRisk === 0}>
					<p class="text-xs text-tertiary-600">拥堵风险</p>
					<p class="text-lg font-bold" class:text-error-700={result.congestionRisk >= 40} class:text-info-700={result.congestionRisk < 40 && result.congestionRisk > 0} class:text-success-700={result.congestionRisk === 0}>
						{getCongestionRiskLevel(result.congestionRisk).label}
						<span class="text-xs font-normal text-tertiary-500"> ({result.congestionRisk}%)</span>
					</p>
				</div>
			</div>

			<div>
				<p class="text-sm font-medium text-primary-700 mb-2">各车路线详情</p>
				<div class="space-y-2 max-h-40 overflow-y-auto">
					{#if result.routes.length === 0}
						<p class="text-xs text-tertiary-500 text-center py-2">暂无数据</p>
					{:else}
						{#each result.routes as route (route.cartId)}
							{@const cart = $carts.find((c) => c.id === route.cartId)}
							<div class="p-2 rounded bg-surface-50 border border-surface-200">
								<div class="flex items-center gap-2 mb-1">
									<div
										class="w-3 h-3 rounded-full border border-gray-700"
										style="background-color: {cart?.color || '#888'}"
									></div>
									<span class="text-sm font-medium">{route.cartName}</span>
									{#if route.hasPath}
										<span class="text-xs text-success-600">✓ 可达</span>
									{:else}
										<span class="text-xs text-error-600">✗ 不可达</span>
									{/if}
								</div>
								{#if route.hasPath}
									<div class="grid grid-cols-3 gap-1 text-xs text-tertiary-600">
										<div>
											<span class="text-tertiary-500">时长</span>
											<span class="ml-1 font-medium text-primary-700">
												{route.totalTime.toFixed(1)}</span>
										</div>
										<div>
											<span class="text-tertiary-500">距离</span>
											<span class="ml-1 font-medium text-primary-700">
												{route.totalDistance.toFixed(0)}</span>
										</div>
										<div>
											<span class="text-tertiary-500">等待</span>
											<span class="ml-1 font-medium text-warning-600">
												{route.waitTime.toFixed(1)}</span>
										</div>
									</div>
									<div class="text-xs text-tertiary-500 mt-1">
										途经 {route.positions.length - 1} 段轨道 · {route.switchCount} 个岔道
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<div>
				<p class="text-sm font-medium text-primary-700 mb-2">
					冲突检测 ({sortedConflicts.length})
				</p>
				<div class="space-y-2 max-h-48 overflow-y-auto">
					{#if sortedConflicts.length === 0}
						<div class="p-3 rounded-lg bg-success-50 text-center">
							<p class="text-sm text-success-700">✓ 无冲突，调度方案安全</p>
						</div>
					{:else}
						{#each sortedConflicts as conflict (conflict.id)}
							<div
								class="p-2 rounded-lg border {getSeverityColor(conflict.severity)}">
								<div class="flex items-center justify-between mb-1">
									<span class="text-xs font-medium">
										{getTypeLabel(conflict.type)}
									</span>
									<span
										class="text-xs px-1.5 py-0.5 rounded bg-white/50">
										{getSeverityLabel(conflict.severity)}
									</span>
								</div>
								<p class="text-xs">{conflict.description}</p>
								<p class="text-xs text-tertiary-500 mt-1">
									时段: {conflict.startTime.toFixed(1)} - {conflict.endTime.toFixed(1)}
								</p>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'compare'}
		<div class="space-y-3">
			<p class="text-xs text-tertiary-500">勾选下方调度方案进行对比</p>

			<div class="space-y-1 max-h-32 overflow-y-auto">
				{#if dispatchSchemesSorted.length === 0}
					<p class="text-xs text-tertiary-500 text-center py-2">暂无保存的方案</p>
				{:else}
					{#each dispatchSchemesSorted as scheme (scheme.id)}
						<label class="flex items-center gap-2 p-2 rounded hover:bg-surface-100 cursor-pointer">
							<input
								type="checkbox"
								class="checkbox"
								checked={selectedCompareIds.has(scheme.id)}
								on:change={() => toggleCompare(scheme.id)}
							/>
							<span class="text-sm">{scheme.name}</span>
							<span class="text-xs text-tertiary-500 ml-auto">
								{scheme.carts.length} 辆
							</span>
						</label>
					{/each}
				{/if}
			</div>

			{#if selectedCompareIds.size > 0}
				<hr class="my-2" />
				<div class="bg-primary-50 p-3 rounded-lg">
					<p class="text-sm font-medium text-primary-700 mb-2">方案对比</p>
					<div class="overflow-x-auto">
						<table class="table table-compact w-full text-xs">
							<thead>
								<tr>
									<th>方案名</th>
									<th class="text-right">总时长</th>
									<th class="text-right">总距离</th>
									<th class="text-right">拥堵风险</th>
									<th class="text-right">岔道数</th>
								</tr>
							</thead>
							<tbody>
								{#each compareResults as cr (cr.schemeId)}
									<tr>
										<td class="font-medium">{cr.schemeName}</td>
										<td class="text-right">{cr.result?.totalTime.toFixed(1) || '-'}</td>
										<td class="text-right">{cr.result?.totalDistance.toFixed(0) || '-'}</td>
										<td class="text-right" class:text-error-600={cr.result && cr.result.congestionRisk >= 40} class:text-warning-600={cr.result && cr.result.congestionRisk > 0 && cr.result.congestionRisk < 40} class:text-success-600={cr.result && cr.result.congestionRisk === 0}>
											{cr.result ? `${cr.result.congestionRisk}%` : '-'}
										</td>
										<td class="text-right text-amber-600">
											{cr.result?.totalSwitchCount || '-'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
