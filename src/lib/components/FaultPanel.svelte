<script lang="ts">
	import { get } from 'svelte/store';
	import {
		nodes,
		edges,
		carts,
		faults,
		selectedFaultId,
		faultImpactResults,
		repairPriorities,
		faultComparisonResult,
		addFault,
		updateFault,
		deleteFault,
		startRepair,
		resolveFault,
		getAvailableFaultTypes,
		getFaultTypeById,
		clearAllFaults
	} from '$lib/stores';
	import type {
		Fault,
		FaultType,
		FaultSeverity,
		FaultTargetType,
		FaultStatus,
		AffectedCart
	} from '$lib/types';

	let activeTab: 'config' | 'impact' | 'priority' | 'compare' = 'config';
	let showAddFault = false;
	let addFaultTargetType: FaultTargetType = 'node';
	let selectedTargetId = '';
	let selectedFaultTypeId = '';
	let occurrenceTime = 10;
	let repairDuration = 20;
	let impactScope = 1;

	$: nodesArray = $nodes;
	$: edgesArray = $edges;
	$: cartsArray = $carts;
	$: faultsArray = $faults;
	$: impactResults = $faultImpactResults;
	$: priorities = $repairPriorities;
	$: comparison = $faultComparisonResult;

	$: availableFaultTypes = getAvailableFaultTypes(
		addFaultTargetType,
		addFaultTargetType === 'node'
			? nodesArray.find((n) => n.id === selectedTargetId)?.type
			: undefined
	);

	$: selectedTargetLabel = (() => {
		if (addFaultTargetType === 'node') {
			const node = nodesArray.find((n) => n.id === selectedTargetId);
			return node ? node.label : '';
		} else {
			const edge = edgesArray.find((e) => e.id === selectedTargetId);
			return edge ? `${edge.source.slice(-2)}→${edge.target.slice(-2)}` : '';
		}
	})();

	function getSeverityColor(severity: FaultSeverity): string {
		switch (severity) {
			case 'critical':
				return 'text-error-700 bg-error-100';
			case 'major':
				return 'text-warning-700 bg-warning-100';
			case 'minor':
				return 'text-info-700 bg-info-100';
			default:
				return 'text-tertiary-600 bg-surface-100';
		}
	}

	function getSeverityLabel(severity: FaultSeverity): string {
		switch (severity) {
			case 'critical':
				return '严重';
			case 'major':
				return '较重';
			case 'minor':
				return '轻微';
			default:
				return '未知';
		}
	}

	function getStatusColor(status: FaultStatus): string {
		switch (status) {
			case 'pending':
				return 'text-error-600 bg-error-50';
			case 'repairing':
				return 'text-warning-600 bg-warning-50';
			case 'resolved':
				return 'text-success-600 bg-success-50';
			default:
				return 'text-tertiary-600 bg-surface-50';
		}
	}

	function getStatusLabel(status: FaultStatus): string {
		switch (status) {
			case 'pending':
				return '待处理';
			case 'repairing':
				return '抢修中';
			case 'resolved':
				return '已修复';
			default:
				return '未知';
		}
	}

	function getImpactLevelColor(level: 'high' | 'medium' | 'low'): string {
		switch (level) {
			case 'high':
				return 'text-error-600';
			case 'medium':
				return 'text-warning-600';
			case 'low':
				return 'text-info-600';
		}
	}

	function getImpactLevelLabel(level: 'high' | 'medium' | 'low'): string {
		switch (level) {
			case 'high':
				return '严重影响';
			case 'medium':
				return '中等影响';
			case 'low':
				return '轻微影响';
		}
	}

	function handleAddFault() {
		if (!selectedTargetId || !selectedFaultTypeId) return;

		const faultType = getFaultTypeById(selectedFaultTypeId);
		if (!faultType) return;

		addFault(
			addFaultTargetType,
			selectedTargetId,
			selectedTargetLabel,
			faultType,
			occurrenceTime,
			repairDuration,
			impactScope
		);

		showAddFault = false;
		selectedTargetId = '';
		selectedFaultTypeId = '';
	}

	function handleTargetTypeChange(type: FaultTargetType) {
		addFaultTargetType = type;
		selectedTargetId = '';
		selectedFaultTypeId = '';
	}

	function handleTargetSelect(event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		selectedTargetId = target.value;
		selectedFaultTypeId = '';
	}

	function handleFaultTypeSelect(event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		selectedFaultTypeId = target.value;

		const faultType = getFaultTypeById(target.value);
		if (faultType) {
			repairDuration = faultType.defaultRepairTime;
		}
	}

	function handleDeleteFault(faultId: string) {
		if (confirm('确定要删除此故障记录吗？')) {
			deleteFault(faultId);
		}
	}

	function handleStartRepair(faultId: string) {
		startRepair(faultId);
	}

	function handleResolveFault(faultId: string) {
		resolveFault(faultId);
	}

	function getFaultImpact(faultId: string) {
		return impactResults.find((ir) => ir.faultId === faultId);
	}

	function formatTime(time: number): string {
		return time.toFixed(1);
	}
</script>

<div class="card p-4 space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-bold text-primary-900">🔧 设备故障与应急抢修指挥</h3>
	</div>

	<div class="flex gap-1 text-xs">
		<button
			class="btn btn-xs flex-1"
			class:variant-filled-primary={activeTab === 'config'}
			class:variant-soft={activeTab !== 'config'}
			on:click={() => (activeTab = 'config')}
		>
			故障配置
		</button>
		<button
			class="btn btn-xs flex-1"
			class:variant-filled-primary={activeTab === 'impact'}
			class:variant-soft={activeTab !== 'impact'}
			on:click={() => (activeTab = 'impact')}
		>
			影响评估
		</button>
		<button
			class="btn btn-xs flex-1"
			class:variant-filled-primary={activeTab === 'priority'}
			class:variant-soft={activeTab !== 'priority'}
			on:click={() => (activeTab = 'priority')}
		>
			抢修排序
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
					当前故障: <span class="font-medium text-primary-700">{faultsArray.length}</span> 个
				</span>
				<div class="flex gap-1">
					{#if faultsArray.length > 0}
						<button
							class="btn btn-xs variant-ghost-danger"
							on:click={() => {
								if (confirm('确定清空所有故障吗？')) clearAllFaults();
							}}
						>
							清空
						</button>
					{/if}
					<button
						class="btn btn-xs variant-filled-primary"
						on:click={() => (showAddFault = !showAddFault)}
					>
						{showAddFault ? '取消' : '+ 添加故障'}
					</button>
				</div>
			</div>

			{#if showAddFault}
				<div class="p-3 bg-primary-50 rounded-lg space-y-2">
					<p class="text-sm font-medium text-primary-700">新增故障</p>

					<div class="flex gap-2">
						<button
							class="btn btn-xs flex-1"
							class:variant-filled-primary={addFaultTargetType === 'node'}
							class:variant-soft={addFaultTargetType !== 'node'}
							on:click={() => handleTargetTypeChange('node')}
						>
							节点故障
						</button>
						<button
							class="btn btn-xs flex-1"
							class:variant-filled-primary={addFaultTargetType === 'edge'}
							class:variant-soft={addFaultTargetType !== 'edge'}
							on:click={() => handleTargetTypeChange('edge')}
						>
							轨道故障
						</button>
					</div>

					<div>
						<span class="text-xs text-tertiary-500">
							选择{addFaultTargetType === 'node' ? '节点' : '轨道'}
						</span>
						<select
							class="input input-sm w-full text-xs"
							value={selectedTargetId}
							on:change={handleTargetSelect}
						>
							<option value="">请选择...</option>
							{#if addFaultTargetType === 'node'}
								{#each nodesArray as node (node.id)}
									<option value={node.id}>
										{node.label} ({node.type === 'loading'
											? '装载点'
											: node.type === 'unloading'
												? '卸载点'
												: node.type === 'switch'
													? '岔道'
													: '普通'})
									</option>
								{/each}
							{:else}
								{#each edgesArray as edge (edge.id)}
									<option value={edge.id}>
										{nodesArray.find((n) => n.id === edge.source)?.label || edge.source} →
										{nodesArray.find((n) => n.id === edge.target)?.label || edge.target}
										({edge.length}米{edge.isSwitch ? ', 岔道' : ''})
									</option>
								{/each}
							{/if}
						</select>
					</div>

					{#if selectedTargetId && availableFaultTypes.length > 0}
						<div>
							<span class="text-xs text-tertiary-500">故障类型</span>
							<select
								class="input input-sm w-full text-xs"
								value={selectedFaultTypeId}
								on:change={handleFaultTypeSelect}
							>
								<option value="">请选择故障类型...</option>
								{#each availableFaultTypes as ft (ft.id)}
									<option value={ft.id}>
										{ft.name} [{getSeverityLabel(ft.severity)}]
									</option>
								{/each}
							</select>
						</div>
					{/if}

					{#if selectedFaultTypeId}
						<div class="grid grid-cols-2 gap-2">
							<div>
								<span class="text-xs text-tertiary-500">发生时间</span>
								<input
									type="number"
									class="input input-sm w-full text-xs"
									min="0"
									step="1"
									bind:value={occurrenceTime}
								/>
							</div>
							<div>
								<span class="text-xs text-tertiary-500">修复时长</span>
								<input
									type="number"
									class="input input-sm w-full text-xs"
									min="1"
									step="1"
									bind:value={repairDuration}
								/>
							</div>
						</div>

						<div>
							<span class="text-xs text-tertiary-500">
								影响范围: {impactScope} 级
							</span>
							<input
								type="range"
								min="0"
								max="3"
								step="1"
								bind:value={impactScope}
								class="w-full"
							/>
							<p class="text-xs text-tertiary-400">
								影响范围越大，受影响的相邻节点越多
							</p>
						</div>

						<button
							class="btn btn-sm variant-filled-success w-full"
							on:click={handleAddFault}
							disabled={!selectedTargetId || !selectedFaultTypeId}
						>
							确认添加故障
						</button>
					{/if}
				</div>
			{/if}

			<div class="space-y-2 max-h-64 overflow-y-auto">
				{#if faultsArray.length === 0}
					<p class="text-xs text-tertiary-500 text-center py-4">暂无故障记录</p>
				{:else}
					{#each faultsArray as fault (fault.id)}
						<div
							class="p-2 rounded-lg border border-surface-300 bg-surface-50 space-y-1"
							class:border-error-400={fault.status === 'pending'}
							class:border-warning-400={fault.status === 'repairing'}
							class:border-success-400={fault.status === 'resolved'}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span
										class="text-xs px-1.5 py-0.5 rounded {getSeverityColor(fault.severity)}"
									>
										{getSeverityLabel(fault.severity)}
									</span>
									<span class="text-sm font-medium">{fault.faultTypeName}</span>
								</div>
								<span
									class="text-xs px-1.5 py-0.5 rounded {getStatusColor(fault.status)}"
								>
									{getStatusLabel(fault.status)}
								</span>
							</div>

							<div class="text-xs text-tertiary-600">
								位置: {fault.targetType === 'node' ? '节点' : '轨道'} {fault.targetLabel}
							</div>

							<div class="grid grid-cols-2 gap-1 text-xs text-tertiary-500">
								<div>发生: T={formatTime(fault.occurrenceTime)}</div>
								<div>修复需: {fault.repairDuration}单位</div>
							</div>

							<p class="text-xs text-tertiary-500">{fault.description}</p>

							<div class="flex gap-1 pt-1">
								{#if fault.status === 'pending'}
									<button
										class="btn btn-xs variant-soft-warning flex-1"
										on:click={() => handleStartRepair(fault.id)}
									>
										开始抢修
									</button>
								{/if}
								{#if fault.status === 'repairing'}
									<button
										class="btn btn-xs variant-soft-success flex-1"
										on:click={() => handleResolveFault(fault.id)}
									>
										完成修复
									</button>
								{/if}
								<button
									class="btn btn-xs variant-ghost-danger"
									on:click={() => handleDeleteFault(fault.id)}
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

	{#if activeTab === 'impact'}
		<div class="space-y-3">
			{#if faultsArray.length === 0 || cartsArray.length === 0}
				<p class="text-xs text-tertiary-500 text-center py-4">
					请先添加故障和矿车以查看影响评估
				</p>
			{:else}
				{#each faultsArray as fault (fault.id)}
					{@const impact = getFaultImpact(fault.id)}
					{#if impact}
						<div class="p-3 rounded-lg border border-surface-300 bg-surface-50 space-y-2">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span
										class="text-xs px-1.5 py-0.5 rounded {getSeverityColor(fault.severity)}"
									>
										{getSeverityLabel(fault.severity)}
									</span>
									<span class="text-sm font-medium">{fault.faultTypeName}</span>
								</div>
								<span class="text-xs text-tertiary-500">
									影响 {impact.totalAffectedCount} 辆车
								</span>
							</div>

							<div class="grid grid-cols-2 gap-2 text-xs">
								<div class="bg-error-50 p-2 rounded">
									<p class="text-tertiary-500">总延误时间</p>
									<p class="font-bold text-error-600">
										{impact.totalDelayTime.toFixed(1)}
									</p>
								</div>
								<div
									class="p-2 rounded"
									class:bg-error-50={impact.hasUnreachableCarts}
									class:bg-success-50={!impact.hasUnreachableCarts}
								>
									<p class="text-tertiary-500">路线可达</p>
									<p
										class="font-bold"
										class:text-error-600={impact.hasUnreachableCarts}
										class:text-success-600={!impact.hasUnreachableCarts}
									>
										{impact.hasUnreachableCarts ? '有不可达' : '全部可达'}
									</p>
								</div>
							</div>

							{#if impact.affectedCarts.length > 0}
								<div>
									<p class="text-xs font-medium text-primary-700 mb-1">受影响车辆</p>
									<div class="space-y-1 max-h-32 overflow-y-auto">
										{#each impact.affectedCarts as cart (cart.cartId)}
											<div
												class="flex items-center justify-between p-1.5 bg-white rounded text-xs"
											>
												<div class="flex items-center gap-1.5">
													<div
														class="w-3 h-3 rounded-full border border-gray-600"
														style="background-color: {cart.cartColor}"
													></div>
													<span>{cart.cartName}</span>
												</div>
												<div class="flex items-center gap-2">
													<span class={getImpactLevelColor(cart.impactLevel)}>
														{getImpactLevelLabel(cart.impactLevel)}
													</span>
													<span class="text-tertiary-500">
														{cart.delayTime > 0
															? `+${cart.delayTime.toFixed(1)}`
															: '不可达'}
													</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if impact.alternativeRoutesAvailable}
								<div class="text-xs text-success-600 bg-success-50 p-2 rounded">
									✓ 存在替代路线，建议重新规划运输方案
								</div>
							{/if}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	{/if}

	{#if activeTab === 'priority'}
		<div class="space-y-2">
			{#if priorities.length === 0}
				<p class="text-xs text-tertiary-500 text-center py-4">
					请先添加故障以查看抢修优先级排序
				</p>
			{:else}
				<p class="text-xs text-tertiary-500">
					基于故障严重程度、影响车辆数和延误时间综合排序
				</p>

				<div class="space-y-2 max-h-80 overflow-y-auto">
					{#each priorities as item, index (item.faultId)}
						{@const fault = faultsArray.find((f) => f.id === item.faultId)}
						{#if fault}
							<div
								class="p-3 rounded-lg border-2 bg-surface-50 space-y-2"
								class:border-error-400={index === 0}
								class:border-warning-400={index === 1}
								class:border-info-400={index === 2}
								class:border-surface-200={index > 2}
							>
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<div
											class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
											class:bg-error-500={index === 0}
											class:bg-warning-500={index === 1}
											class:bg-info-500={index === 2}
											class:bg-surface-400={index > 2}
										>
											{index + 1}
										</div>
										<div>
											<div class="text-sm font-medium">{item.faultName}</div>
											<div class="text-xs text-tertiary-500">
												位置: {item.targetLabel}
											</div>
										</div>
									</div>
									<div class="text-right">
										<div class="text-lg font-bold text-primary-700">
											{item.priority}
										</div>
										<div class="text-xs text-tertiary-500">优先级分</div>
									</div>
								</div>

								<div class="grid grid-cols-3 gap-1 text-xs">
									<div class="text-center">
										<p class="text-tertiary-500">影响车辆</p>
										<p class="font-medium text-error-600">
											{item.affectedCartCount} 辆
										</p>
									</div>
									<div class="text-center">
										<p class="text-tertiary-500">总延误</p>
										<p class="font-medium text-warning-600">
											{item.totalDelayTime.toFixed(0)}
										</p>
									</div>
									<div class="text-center">
										<p class="text-tertiary-500">修复需时</p>
										<p class="font-medium text-info-600">
											{item.repairDuration}
										</p>
									</div>
								</div>

								{#if index === 0}
									<div class="text-xs text-error-600 bg-error-50 p-1.5 rounded text-center">
										⚠ 最高优先级，建议立即抢修
									</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'compare'}
		<div class="space-y-3">
			{#if !comparison}
				<p class="text-xs text-tertiary-500 text-center py-4">
					请先添加故障以查看方案对比
				</p>
			{:else}
				<p class="text-xs text-tertiary-500">
					故障发生前后运输方案对比分析
				</p>

				<div class="overflow-x-auto">
					<table class="table table-compact w-full text-xs">
						<thead>
							<tr>
								<th>指标</th>
								<th class="text-right">故障前</th>
								<th class="text-right">故障后</th>
								<th class="text-right">变化</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>总运输时长</td>
								<td class="text-right">
									{comparison.beforeFault?.totalTime.toFixed(1) || '-'}
								</td>
								<td class="text-right">
									{comparison.afterFault?.totalTime.toFixed(1) || '-'}
								</td>
								<td
									class="text-right font-medium"
									class:text-error-600={comparison.deltaTotalTime > 0}
									class:text-success-600={comparison.deltaTotalTime <= 0}
								>
									{comparison.deltaTotalTime > 0 ? '+' : ''}
									{comparison.deltaTotalTime.toFixed(1)}
								</td>
							</tr>
							<tr>
								<td>总运输距离</td>
								<td class="text-right">
									{comparison.beforeFault?.totalDistance.toFixed(0) || '-'}
								</td>
								<td class="text-right">
									{comparison.afterFault?.totalDistance.toFixed(0) || '-'}
								</td>
								<td
									class="text-right font-medium"
									class:text-error-600={comparison.deltaTotalDistance > 0}
									class:text-success-600={comparison.deltaTotalDistance <= 0}
								>
									{comparison.deltaTotalDistance > 0 ? '+' : ''}
									{comparison.deltaTotalDistance.toFixed(0)}
								</td>
							</tr>
							<tr>
								<td>拥堵风险</td>
								<td class="text-right">
									{comparison.beforeFault?.congestionRisk || 0}%
								</td>
								<td class="text-right">
									{comparison.afterFault?.congestionRisk || 0}%
								</td>
								<td
									class="text-right font-medium"
									class:text-error-600={comparison.deltaCongestionRisk > 0}
									class:text-success-600={comparison.deltaCongestionRisk <= 0}
								>
									{comparison.deltaCongestionRisk > 0 ? '+' : ''}
									{comparison.deltaCongestionRisk}%
								</td>
							</tr>
							<tr>
								<td>受影响车辆</td>
								<td class="text-right">-</td>
								<td class="text-right text-error-600 font-medium">
									{comparison.affectedCartCount} 辆
								</td>
								<td class="text-right">-</td>
							</tr>
						</tbody>
					</table>
				</div>

				{#if comparison.afterFault && comparison.beforeFault}
					<div class="space-y-1">
						<p class="text-xs font-medium text-primary-700">各车详细对比</p>
						<div class="max-h-40 overflow-y-auto space-y-1">
							{#each comparison.beforeFault.routes as route (route.cartId)}
								{@const afterRoute = comparison.afterFault?.routes.find(
									(r) => r.cartId === route.cartId
								)}
								{@const cart = cartsArray.find((c) => c.id === route.cartId)}
								{#if afterRoute && cart}
									<div
										class="flex items-center justify-between p-2 bg-surface-50 rounded text-xs"
									>
										<div class="flex items-center gap-2">
											<div
												class="w-3 h-3 rounded-full border border-gray-600"
												style="background-color: {cart.color}"
											></div>
											<span>{route.cartName}</span>
										</div>
										<div class="flex gap-3">
											<span class="text-tertiary-500">
												{route.totalTime.toFixed(1)} →
											</span>
											<span
												class="font-medium"
												class:text-error-600={afterRoute.totalTime >
													route.totalTime * 1.1}
												class:text-warning-600={afterRoute.totalTime >
													route.totalTime &&
													afterRoute.totalTime <= route.totalTime * 1.1}
												class:text-success-600={afterRoute.totalTime <=
													route.totalTime}
											>
												{afterRoute.hasPath
													? afterRoute.totalTime.toFixed(1)
													: '不可达'}
											</span>
										</div>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				<div class="bg-warning-50 p-2 rounded text-xs text-warning-700">
					💡 <strong>建议:</strong> 优先处理高优先级故障，恢复关键线路运输能力。
					所有故障修复后运输能力可恢复至故障前水平。
				</div>
			{/if}
		</div>
	{/if}
</div>
