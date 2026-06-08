<script lang="ts">
	import { get } from 'svelte/store';
	import { createEventDispatcher } from 'svelte';
	import {
		nodes,
		edges,
		carts,
		faults,
		selectedFaultId,
		faultImpactResults,
		repairPriorities,
		faultComparisonResult,
		emergencyDetourResults,
		enhancedComparisonResult,
		integratedPlaybackFrames,
		addFault,
		updateFault,
		deleteFault,
		startRepair,
		resolveFault,
		getAvailableFaultTypes,
		getFaultTypeById,
		clearAllFaults,
		setPlaybackActive,
		setPlaybackTime
	} from '$lib/stores';
	import { generateFaultPlaybackFrames } from '$lib/faultManagement';
	import type {
		Fault,
		FaultType,
		FaultSeverity,
		FaultTargetType,
		FaultStatus,
		AffectedCart,
		DetourPlan,
		WaitStrategy,
		IntegratedPlaybackFrame,
		PlaybackFrame
	} from '$lib/types';

	type TabType = 'config' | 'impact' | 'detour' | 'priority' | 'compare' | 'timeline';

	const dispatch = createEventDispatcher<{
		frameChange: PlaybackFrame;
		timelinePause: void;
	}>();

	let activeTab: TabType = 'config';
	let isPlaying = false;
	let playbackIndex = 0;
	let playbackSpeed = 1;
	let playbackInterval: ReturnType<typeof setInterval> | null = null;
	let expandedCartId: string | null = null;
	let expandedFaultId: string | null = null;
	let expandedDetourCartId: string | null = null;
	let expandedCompareCartId: string | null = null;

	$: nodesArray = $nodes;
	$: edgesArray = $edges;
	$: cartsArray = $carts;
	$: faultsArray = $faults;
	$: impactResults = $faultImpactResults;
	$: priorities = $repairPriorities;
	$: comparison = $faultComparisonResult;
	$: detourResults = $emergencyDetourResults;
	$: enhancedComparison = $enhancedComparisonResult;
	$: timelineFrames = $integratedPlaybackFrames;

	$: currentTimelineFrame = timelineFrames[playbackIndex] || null;

	$: if (currentTimelineFrame && activeTab === 'timeline') {
		setPlaybackTime(currentTimelineFrame.time);
		dispatch('frameChange', currentTimelineFrame as unknown as PlaybackFrame);
	}

	let showAddFault = false;
	let addFaultTargetType: FaultTargetType = 'node';
	let selectedTargetId = '';
	let selectedFaultTypeId = '';
	let occurrenceTime = 10;
	let repairDuration = 20;
	let impactScope = 1;

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

	function getWaitStrategyLabel(strategy: WaitStrategy): string {
		switch (strategy) {
			case 'hold_at_node':
				return '原地等待';
			case 'reroute_immediately':
				return '立即绕行';
			case 'wait_then_reroute':
				return '等待后绕行';
			default:
				return '未知策略';
		}
	}

	function getWaitStrategyColor(strategy: WaitStrategy): string {
		switch (strategy) {
			case 'hold_at_node':
				return 'text-warning-700 bg-warning-100';
			case 'reroute_immediately':
				return 'text-success-700 bg-success-100';
			case 'wait_then_reroute':
				return 'text-info-700 bg-info-100';
			default:
				return 'text-tertiary-600 bg-surface-100';
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

	function getDetourResult(faultId: string) {
		return detourResults.find((dr) => dr.faultId === faultId);
	}

	function formatTime(time: number): string {
		return time.toFixed(1);
	}

	function getPhaseLabel(
		phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered'
	): string {
		switch (phase) {
			case 'normal':
				return '正常运行';
			case 'fault-occurring':
				return '故障发生';
			case 'fault-active':
				return '故障影响';
			case 'repairing':
				return '抢修中';
			case 'recovered':
				return '修复完成';
			default:
				return '未知';
		}
	}

	function getPhaseColor(
		phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered'
	): string {
		switch (phase) {
			case 'normal':
				return 'text-success-600 bg-success-100';
			case 'fault-occurring':
				return 'text-error-600 bg-error-100';
			case 'fault-active':
				return 'text-error-700 bg-error-50';
			case 'repairing':
				return 'text-warning-600 bg-warning-100';
			case 'recovered':
				return 'text-success-600 bg-success-100';
			default:
				return 'text-tertiary-600 bg-surface-100';
		}
	}

	function togglePlayback() {
		if (isPlaying) {
			stopPlayback();
		} else {
			startPlayback();
		}
	}

	function startPlayback() {
		if (timelineFrames.length === 0) return;
		if (playbackIndex >= timelineFrames.length - 1) {
			playbackIndex = 0;
		}
		isPlaying = true;
		setPlaybackActive(true);
		playbackInterval = setInterval(() => {
			playbackIndex++;
			if (playbackIndex >= timelineFrames.length - 1) {
				stopPlayback();
				playbackIndex = timelineFrames.length - 1;
			}
		}, 100 / playbackSpeed);
	}

	function stopPlayback() {
		isPlaying = false;
		if (playbackInterval) {
			clearInterval(playbackInterval);
			playbackInterval = null;
		}
	}

	function resetPlayback() {
		stopPlayback();
		playbackIndex = 0;
		setPlaybackActive(false);
	}

	function handleTabChange(tab: TabType) {
		if (activeTab === 'timeline' && tab !== 'timeline') {
			stopPlayback();
			setPlaybackActive(false);
		}
		if (tab === 'timeline') {
			playbackIndex = 0;
		}
		activeTab = tab;
	}

	function toggleCartExpand(cartId: string) {
		expandedCartId = expandedCartId === cartId ? null : cartId;
	}

	function toggleFaultExpand(faultId: string) {
		expandedFaultId = expandedFaultId === faultId ? null : faultId;
	}

	function toggleDetourCartExpand(cartId: string) {
		expandedDetourCartId = expandedDetourCartId === cartId ? null : cartId;
	}

	function toggleCompareCartExpand(cartId: string) {
		expandedCompareCartId = expandedCompareCartId === cartId ? null : cartId;
	}

	function getEventTypeColor(type: string): string {
		switch (type) {
			case 'fault-occur':
				return 'bg-error-50 text-error-700 border-l-error-500';
			case 'repair-start':
				return 'bg-warning-50 text-warning-700 border-l-warning-500';
			case 'repair-complete':
				return 'bg-success-50 text-success-700 border-l-success-500';
			case 'congestion-warning':
				return 'bg-orange-50 text-orange-700 border-l-orange-500';
			case 'reroute':
				return 'bg-info-50 text-info-700 border-l-info-500';
			default:
				return 'bg-surface-50 text-tertiary-700 border-l-surface-400';
		}
	}

	function getCongestionLevel(level: number): string {
		if (level >= 3) return '严重拥堵';
		if (level >= 2) return '中度拥堵';
		return '轻度拥堵';
	}

	function getCongestionColor(level: number): string {
		if (level >= 3) return 'text-error-600';
		if (level >= 2) return 'text-warning-600';
		return 'text-info-600';
	}
</script>

<div class="card p-4 space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-bold text-primary-900">🔧 故障联动调度与应急推演</h3>
	</div>

	<div class="flex gap-1 text-xs flex-wrap">
		<button
			class="btn btn-xs flex-1 min-w-0"
			class:variant-filled-primary={activeTab === 'config'}
			class:variant-soft={activeTab !== 'config'}
			on:click={() => handleTabChange('config')}
		>
			故障配置
		</button>
		<button
			class="btn btn-xs flex-1 min-w-0"
			class:variant-filled-primary={activeTab === 'impact'}
			class:variant-soft={activeTab !== 'impact'}
			on:click={() => handleTabChange('impact')}
		>
			影响评估
		</button>
		<button
			class="btn btn-xs flex-1 min-w-0"
			class:variant-filled-primary={activeTab === 'detour'}
			class:variant-soft={activeTab !== 'detour'}
			on:click={() => handleTabChange('detour')}
		>
			应急绕行
		</button>
		<button
			class="btn btn-xs flex-1 min-w-0"
			class:variant-filled-primary={activeTab === 'priority'}
			class:variant-soft={activeTab !== 'priority'}
			on:click={() => handleTabChange('priority')}
		>
			抢修排序
		</button>
		<button
			class="btn btn-xs flex-1 min-w-0"
			class:variant-filled-primary={activeTab === 'compare'}
			class:variant-soft={activeTab !== 'compare'}
			on:click={() => handleTabChange('compare')}
		>
			三阶段对比
		</button>
		<button
			class="btn btn-xs flex-1 min-w-0"
			class:variant-filled-primary={activeTab === 'timeline'}
			class:variant-soft={activeTab !== 'timeline'}
			on:click={() => handleTabChange('timeline')}
		>
			⏱ 时间推演
		</button>
	</div>

	<!-- 配置 Tab -->
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
					<p class="text-sm font-medium text-primary-700">新增故障（按时间触发）</p>

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
								<span class="text-xs text-tertiary-500">触发时间</span>
								<input
									type="number"
									class="input input-sm w-full text-xs"
									min="0"
									step="1"
									bind:value={occurrenceTime}
								/>
								<p class="text-xs text-tertiary-400 mt-0.5">T = {occurrenceTime} 时触发</p>
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
								<p class="text-xs text-tertiary-400 mt-0.5">预计 {repairDuration} 单位修复</p>
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
								<div>触发: T={formatTime(fault.occurrenceTime)}</div>
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

	<!-- 影响评估 Tab -->
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
									<p class="text-xs font-medium text-primary-700 mb-1">
										受影响车辆（点击查看详情）
									</p>
									<div class="space-y-1 max-h-48 overflow-y-auto">
										{#each impact.affectedCarts as cart (cart.cartId)}
											<div class="bg-white rounded text-xs overflow-hidden">
												<div
													class="flex items-center justify-between p-1.5 cursor-pointer hover:bg-primary-50"
													on:click={() => toggleCartExpand(cart.cartId)}
												>
													<div class="flex items-center gap-1.5">
														<span class="text-tertiary-400 text-xs">
															{expandedCartId === cart.cartId ? '▼' : '▶'}
														</span>
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

												{#if expandedCartId === cart.cartId}
													<div class="p-2 bg-surface-50 border-t border-surface-200 space-y-2">
														<div>
															<p class="text-xs text-tertiary-500 mb-1">
																原始路线
															</p>
															<div class="flex flex-wrap gap-1">
																{#each cart.originalRoute as nodeId, idx (nodeId)}
																	<span
																		class="px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded text-xs"
																	>
																		{nodeId}
																	</span>
																	{#if idx < cart.originalRoute.length - 1}
																		<span class="text-tertiary-300">→</span>
																	{/if}
																{/each}
															</div>
															<p class="text-xs text-tertiary-500 mt-1">
																耗时: {cart.originalTotalTime.toFixed(1)}
															</p>
														</div>

														<div>
															<p class="text-xs text-tertiary-500 mb-1">
																替代路线
															</p>
															{#if cart.hasAlternative && cart.alternativeRoute}
																<div class="flex flex-wrap gap-1">
																	{#each cart.alternativeRoute as nodeId, idx (nodeId)}
																		<span
																			class="px-1.5 py-0.5 bg-success-100 text-success-700 rounded text-xs"
																		>
																			{nodeId}
																		</span>
																		{#if idx < cart.alternativeRoute.length - 1}
																			<span class="text-tertiary-300">→</span>
																		{/if}
																	{/each}
																</div>
																<p class="text-xs text-tertiary-500 mt-1">
																	耗时: {cart.newTotalTime > 0
																		? cart.newTotalTime.toFixed(1)
																		: '-'}
																</p>
															{:else}
																<p class="text-xs text-error-600">
																	无替代路线，车辆不可达
																</p>
															{/if}
														</div>
													</div>
												{/if}
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

	<!-- 应急绕行 Tab -->
	{#if activeTab === 'detour'}
		<div class="space-y-3">
			{#if faultsArray.length === 0 || cartsArray.length === 0}
				<p class="text-xs text-tertiary-500 text-center py-4">
					请先添加故障和矿车以查看应急绕行方案
				</p>
			{:else if detourResults.length === 0}
				<p class="text-xs text-tertiary-500 text-center py-4">暂无应急绕行数据</p>
			{:else}
				{#each detourResults as detour (detour.faultId)}
					{@const fault = faultsArray.find((f) => f.id === detour.faultId)}
					{#if fault}
						<div class="p-3 rounded-lg border border-surface-300 bg-surface-50 space-y-2">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<span
										class="text-xs px-1.5 py-0.5 rounded {getSeverityColor(fault.severity)}"
									>
										{getSeverityLabel(fault.severity)}
									</span>
									<span class="text-sm font-medium">{detour.faultName}</span>
								</div>
								<span class="text-xs text-tertiary-500">
									{detour.totalFeasibleDetours}/{detour.totalAffectedCarts} 可绕行
								</span>
							</div>

							<div
								class="text-xs p-2 rounded {detour.totalFeasibleDetours < detour.totalAffectedCarts
									? 'bg-error-50 text-error-700'
									: 'bg-success-50 text-success-700'}"
							>
								💡 {detour.recommendation}
							</div>

							<div class="grid grid-cols-3 gap-1 text-xs">
								<div class="text-center p-1.5 bg-surface-100 rounded">
									<p class="text-tertiary-500">受影响</p>
									<p class="font-bold text-primary-700">{detour.totalAffectedCarts}</p>
								</div>
								<div class="text-center p-1.5 bg-surface-100 rounded">
									<p class="text-tertiary-500">可绕行</p>
									<p class="font-bold text-success-600">{detour.totalFeasibleDetours}</p>
								</div>
								<div class="text-center p-1.5 bg-surface-100 rounded">
									<p class="text-tertiary-500">总延误</p>
									<p class="font-bold text-warning-600">
										{detour.totalDelayEstimate.toFixed(0)}
									</p>
								</div>
							</div>

							{#if detour.detourPlans.length > 0}
								<div>
									<p class="text-xs font-medium text-primary-700 mb-1">
										各车绕行方案
									</p>
									<div class="space-y-1 max-h-56 overflow-y-auto">
										{#each detour.detourPlans as plan (plan.cartId)}
											<div class="bg-white rounded text-xs overflow-hidden">
												<div
													class="flex items-center justify-between p-1.5 cursor-pointer hover:bg-primary-50"
													on:click={() => toggleDetourCartExpand(plan.cartId)}
												>
													<div class="flex items-center gap-1.5">
														<span class="text-tertiary-400 text-xs">
															{expandedDetourCartId === plan.cartId ? '▼' : '▶'}
														</span>
														<div
															class="w-3 h-3 rounded-full border border-gray-600"
															style="background-color: {plan.cartColor}"
														></div>
														<span>{plan.cartName}</span>
													</div>
													<div class="flex items-center gap-1">
														<span
															class={`text-xs px-1 py-0.5 rounded ${getWaitStrategyColor(plan.waitStrategy)}`}
														>
															{getWaitStrategyLabel(plan.waitStrategy)}
														</span>
													</div>
												</div>

												{#if expandedDetourCartId === plan.cartId}
													<div class="p-2 bg-surface-50 border-t border-surface-200 space-y-2">
														<div class="grid grid-cols-2 gap-2 text-xs">
															<div>
																<p class="text-tertiary-500">原始耗时</p>
																<p class="font-medium">{plan.originalTotalTime.toFixed(1)}</p>
															</div>
															<div>
																<p class="text-tertiary-500">绕行耗时</p>
																<p class="font-medium text-warning-600">
																	{plan.detourTotalTime.toFixed(1)}
																</p>
															</div>
															<div>
																<p class="text-tertiary-500">延误增加</p>
																<p class="font-medium text-error-600">
																	+{plan.delayTime.toFixed(1)}
																</p>
															</div>
															<div>
																<p class="text-tertiary-500">额外距离</p>
																<p class="font-medium">
																	+{plan.additionalDistance.toFixed(0)}
																</p>
															</div>
														</div>

														{#if plan.waitDuration > 0}
															<div class="text-xs bg-warning-50 p-1.5 rounded text-warning-700">
																⏳ 等待时间: {plan.waitDuration.toFixed(1)} 单位
																{#if plan.waitNodeId}
																	，在节点 {plan.waitNodeId}
																{/if}
															</div>
														{/if}

														{#if !plan.feasible && plan.reason}
															<div class="text-xs bg-error-50 p-1.5 rounded text-error-700">
																⚠ {plan.reason}
															</div>
														{/if}

														<div>
															<p class="text-xs text-tertiary-500 mb-1">绕行路线</p>
															<div class="flex flex-wrap gap-1">
																{#each plan.detourRoute as nodeId, idx (nodeId)}
																	<span
																		class="px-1.5 py-0.5 bg-success-100 text-success-700 rounded text-xs"
																	>
																		{nodeId}
																	</span>
																	{#if idx < plan.detourRoute.length - 1}
																		<span class="text-tertiary-300">→</span>
																	{/if}
																{/each}
															</div>
														</div>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	{/if}

	<!-- 抢修排序 Tab -->
	{#if activeTab === 'priority'}
		<div class="space-y-2">
			{#if priorities.length === 0}
				<p class="text-xs text-tertiary-500 text-center py-4">
					请先添加故障以查看抢修优先级排序
				</p>
			{:else}
				<p class="text-xs text-tertiary-500">
					基于故障严重程度、影响车辆数、延误时间和可绕行性综合排序
				</p>

				<div class="space-y-2 max-h-80 overflow-y-auto">
					{#each priorities as item, index (item.faultId)}
						{@const fault = faultsArray.find((f) => f.id === item.faultId)}
						{@const detour = getDetourResult(item.faultId)}
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

								{#if detour && detour.totalFeasibleDetours < detour.totalAffectedCarts}
									<div class="text-xs bg-error-50 text-error-700 p-1.5 rounded">
										⚠ 有 {detour.totalAffectedCarts - detour.totalFeasibleDetours} 辆车无法绕行，需优先抢修
									</div>
								{/if}

								{#if index === 0}
									<div class="text-xs text-error-600 bg-error-50 p-1.5 rounded text-center font-medium">
										🔥 最高优先级，建议立即抢修
									</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- 三阶段对比 Tab -->
	{#if activeTab === 'compare'}
		<div class="space-y-3">
			{#if !enhancedComparison}
				<p class="text-xs text-tertiary-500 text-center py-4">
					请先添加故障以查看三阶段对比
				</p>
			{:else}
				<p class="text-xs text-tertiary-500">
					故障前 · 故障中 · 修复后 三阶段全面对比分析
				</p>

				<div class="bg-primary-50 p-3 rounded-lg">
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium text-primary-700">系统恢复率</span>
						<span class="text-lg font-bold text-success-600">
							{enhancedComparison.recoveryRate.toFixed(1)}%
						</span>
					</div>
					<div class="h-3 bg-surface-200 rounded-full overflow-hidden">
						<div
							class="h-full bg-gradient-to-r from-error-400 via-warning-400 to-success-500 transition-all duration-500"
							style="width: {enhancedComparison.recoveryRate}%"
						></div>
					</div>
					<div class="flex justify-between text-xs text-tertiary-500 mt-1">
						<span>故障影响</span>
						<span>完全恢复</span>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2 text-xs">
					<div class="bg-error-50 p-2 rounded">
						<p class="text-tertiary-500">受影响车辆</p>
						<p class="font-bold text-error-600 text-lg">
							{enhancedComparison.affectedCartCount}
						</p>
					</div>
					<div class="bg-success-50 p-2 rounded">
						<p class="text-tertiary-500">已恢复车辆</p>
						<p class="font-bold text-success-600 text-lg">
							{enhancedComparison.recoveredCartCount}
						</p>
					</div>
				</div>

				<div class="overflow-x-auto">
					<table class="table table-compact w-full text-xs">
						<thead>
							<tr>
								<th>指标</th>
								<th class="text-right text-success-600">故障前</th>
								<th class="text-right text-error-600">故障中</th>
								<th class="text-right text-info-600">修复后</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>总运输时长</td>
								<td class="text-right">
									{enhancedComparison.beforeFault.totalTime.toFixed(1)}
								</td>
								<td class="text-right font-medium text-error-600">
									{enhancedComparison.duringFault.totalTime.toFixed(1)}
								</td>
								<td class="text-right font-medium text-success-600">
									{enhancedComparison.afterRepair.totalTime.toFixed(1)}
								</td>
							</tr>
							<tr>
								<td>总运输距离</td>
								<td class="text-right">
									{enhancedComparison.beforeFault.totalDistance.toFixed(0)}
								</td>
								<td class="text-right font-medium text-error-600">
									{enhancedComparison.duringFault.totalDistance.toFixed(0)}
								</td>
								<td class="text-right">
									{enhancedComparison.afterRepair.totalDistance.toFixed(0)}
								</td>
							</tr>
							<tr>
								<td>拥堵风险</td>
								<td class="text-right">
									{enhancedComparison.beforeFault.congestionRisk}%
								</td>
								<td class="text-right font-medium text-error-600">
									{enhancedComparison.duringFault.congestionRisk}%
								</td>
								<td class="text-right">
									{enhancedComparison.afterRepair.congestionRisk}%
								</td>
							</tr>
							<tr>
								<td>平均速度</td>
								<td class="text-right">
									{enhancedComparison.beforeFault.avgSpeed.toFixed(2)}
								</td>
								<td class="text-right font-medium text-error-600">
									{enhancedComparison.duringFault.avgSpeed.toFixed(2)}
								</td>
								<td class="text-right">
									{enhancedComparison.afterRepair.avgSpeed.toFixed(2)}
								</td>
							</tr>
							<tr>
								<td>总等待时间</td>
								<td class="text-right">
									{enhancedComparison.beforeFault.totalWaitTime.toFixed(1)}
								</td>
								<td class="text-right font-medium text-error-600">
									{enhancedComparison.duringFault.totalWaitTime.toFixed(1)}
								</td>
								<td class="text-right">
									{enhancedComparison.afterRepair.totalWaitTime.toFixed(1)}
								</td>
							</tr>
							<tr>
								<td>可达路线</td>
								<td class="text-right">
									{enhancedComparison.beforeFault.routeCount}
								</td>
								<td class="text-right font-medium text-error-600">
									{enhancedComparison.duringFault.routeCount}
								</td>
								<td class="text-right">
									{enhancedComparison.afterRepair.routeCount}
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				{#if enhancedComparison?.beforeFault?.routes && enhancedComparison?.duringFault?.routes && enhancedComparison?.afterRepair?.routes}
					<div class="space-y-1">
						<p class="text-xs font-medium text-primary-700">各车三阶段对比</p>
						<div class="max-h-48 overflow-y-auto space-y-1">
							{#each enhancedComparison.beforeFault.routes as route (route.cartId)}
								{@const afterRoute = enhancedComparison.duringFault?.routes.find(
									(r) => r.cartId === route.cartId
								)}
								{@const repairedRoute = enhancedComparison.afterRepair?.routes.find(
									(r) => r.cartId === route.cartId
								)}
								{@const cart = cartsArray.find((c) => c.id === route.cartId)}
								{#if afterRoute && cart && repairedRoute}
									<div class="bg-surface-50 rounded text-xs overflow-hidden">
										<div
											class="flex items-center justify-between p-2 cursor-pointer hover:bg-primary-50"
											on:click={() => toggleCompareCartExpand(route.cartId)}
										>
											<div class="flex items-center gap-2">
												<span class="text-tertiary-400">
													{expandedCompareCartId === route.cartId ? '▼' : '▶'}
												</span>
												<div
													class="w-3 h-3 rounded-full border border-gray-600"
													style="background-color: {cart.color}"
												></div>
												<span class="font-medium">{route.cartName}</span>
											</div>
											<span
												class="text-xs px-1.5 py-0.5 rounded"
												class:bg-success-100={repairedRoute.hasPath &&
													repairedRoute.totalTime <= route.totalTime * 1.05}
												class:text-success-700={repairedRoute.hasPath &&
													repairedRoute.totalTime <= route.totalTime * 1.05}
												class:bg-warning-100={repairedRoute.hasPath &&
													repairedRoute.totalTime > route.totalTime * 1.05}
												class:text-warning-700={repairedRoute.hasPath &&
													repairedRoute.totalTime > route.totalTime * 1.05}
												class:bg-error-100={!repairedRoute.hasPath}
												class:text-error-700={!repairedRoute.hasPath}
											>
												{repairedRoute.hasPath
													? repairedRoute.totalTime <= route.totalTime * 1.05
														? '✓ 已恢复'
														: '△ 部分恢复'
													: '✗ 仍不可达'}
											</span>
										</div>

										{#if expandedCompareCartId === route.cartId}
											<div class="p-2 border-t border-surface-200 bg-white space-y-2">
												<div class="grid grid-cols-3 gap-2 text-center">
													<div class="p-2 bg-success-50 rounded">
														<p class="text-tertiary-400 text-xs">故障前</p>
														<p class="font-medium text-success-700">
															{route.totalTime.toFixed(1)}
														</p>
													</div>
													<div class="p-2 bg-error-50 rounded">
														<p class="text-tertiary-400 text-xs">故障中</p>
														<p class="font-medium text-error-700">
															{afterRoute.hasPath
																? afterRoute.totalTime.toFixed(1)
																: '不可达'}
														</p>
													</div>
													<div class="p-2 bg-info-50 rounded">
														<p class="text-tertiary-400 text-xs">修复后</p>
														<p class="font-medium text-info-700">
															{repairedRoute.hasPath
																? repairedRoute.totalTime.toFixed(1)
																: '不可达'}
														</p>
													</div>
												</div>
												<div class="text-xs text-tertiary-500">
													{#if afterRoute.hasPath && route.totalTime > 0}
														故障导致延误 +{(afterRoute.totalTime - route.totalTime).toFixed(1)} ({((afterRoute.totalTime - route.totalTime) / route.totalTime * 100).toFixed(1)}%)
													{/if}
												</div>
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				<div class="bg-info-50 p-2 rounded text-xs text-info-700">
					💡 <strong>说明:</strong> 三阶段对比展示故障对系统的完整影响，
					修复后数据基于所有故障排除后的重新计算结果。
				</div>
			{/if}
		</div>
	{/if}

	<!-- 时间推演 Tab -->
	{#if activeTab === 'timeline'}
		<div class="space-y-3">
			{#if timelineFrames.length === 0}
				<p class="text-xs text-tertiary-500 text-center py-8">
					请先添加故障和小车以使用时间推演功能
				</p>
			{:else}
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-primary-700">⏱ 时间轴推演</span>
							<span
								class={`text-xs px-2 py-0.5 rounded-full font-medium ${getPhaseColor(
									currentTimelineFrame?.phase || 'normal'
								)}`}
							>
								{getPhaseLabel(currentTimelineFrame?.phase || 'normal')}
							</span>
						</div>
						<span class="text-xs text-tertiary-500 font-mono">
							T = {currentTimelineFrame?.time.toFixed(1) || '0.0'}
						</span>
					</div>

					<div class="flex items-center gap-2">
						<button
							class="btn btn-xs variant-soft-primary flex-1"
							on:click={togglePlayback}
						>
							{isPlaying ? '⏸ 暂停' : '▶ 播放'}
						</button>
						<button
							class="btn btn-xs variant-ghost"
							on:click={resetPlayback}
						>
							⟲ 重置
						</button>
					</div>

					<div class="flex items-center gap-2">
						<span class="text-xs text-tertiary-500">速度:</span>
						<div class="flex gap-1">
							{#each [0.5, 1, 2, 4] as speed}
								<button
									class="btn btn-xs"
									class:variant-filled-primary={playbackSpeed === speed}
									class:variant-soft={playbackSpeed !== speed}
									on:click={() => {
										playbackSpeed = speed;
										if (isPlaying) {
											stopPlayback();
											startPlayback();
										}
									}}
								>
									{speed}x
								</button>
							{/each}
						</div>
					</div>

					<div>
						<input
							type="range"
							min="0"
							max={timelineFrames.length - 1}
							bind:value={playbackIndex}
							class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer"
						/>
						<div class="flex justify-between text-xs text-tertiary-400">
							<span>T=0</span>
							<span>T={timelineFrames[timelineFrames.length - 1]?.time.toFixed(0) || 0}</span>
						</div>
					</div>

					<div class="grid grid-cols-3 gap-1 text-xs">
						<div class="text-center p-2 bg-error-50 rounded">
							<p class="text-tertiary-500">活跃故障</p>
							<p class="font-bold text-error-600 text-lg">
								{currentTimelineFrame?.activeFaultIds.length || 0}
							</p>
						</div>
						<div class="text-center p-2 bg-warning-50 rounded">
							<p class="text-tertiary-500">抢修中</p>
							<p class="font-bold text-warning-600 text-lg">
								{currentTimelineFrame?.repairingFaultIds.length || 0}
							</p>
						</div>
						<div class="text-center p-2 bg-success-50 rounded">
							<p class="text-tertiary-500">已修复</p>
							<p class="font-bold text-success-600 text-lg">
								{currentTimelineFrame?.resolvedFaultIds.length || 0}
							</p>
						</div>
					</div>

					{#if currentTimelineFrame && currentTimelineFrame.repairProgress.length > 0}
						<div class="space-y-1">
							<p class="text-xs font-medium text-warning-700">🔧 抢修进度</p>
							<div class="space-y-1">
								{#each currentTimelineFrame.repairProgress as progress (progress.faultId)}
									{@const fault = faultsArray.find((f) => f.id === progress.faultId)}
									{#if fault}
										<div class="bg-warning-50 p-1.5 rounded text-xs">
											<div class="flex items-center justify-between mb-1">
												<span class="font-medium">{fault.faultTypeName}</span>
												<span class="text-warning-600">
													{(progress.progress * 100).toFixed(0)}%
												</span>
											</div>
											<div class="h-1.5 bg-warning-200 rounded-full overflow-hidden">
												<div
													class="h-full bg-warning-500 transition-all"
													style="width: {progress.progress * 100}%"
												></div>
											</div>
											<div class="text-right text-xs text-warning-600 mt-0.5">
												剩余 {progress.remainingTime.toFixed(1)} 单位
											</div>
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					{#if currentTimelineFrame && currentTimelineFrame.congestedEdges.length > 0}
						<div class="space-y-1">
							<p class="text-xs font-medium text-orange-700">
								🚧 拥堵轨道 ({currentTimelineFrame.congestedEdges.length})
							</p>
							<div class="space-y-1 max-h-24 overflow-y-auto">
								{#each currentTimelineFrame.congestedEdges as congested (congested.edgeId)}
									<div class="bg-orange-50 p-1.5 rounded text-xs flex justify-between items-center">
										<span class="text-orange-700">
											轨道 {congested.edgeId.slice(0, 8)}
										</span>
										<span class={`font-medium ${getCongestionColor(congested.level)}`}>
											{congested.level} 辆车 · {getCongestionLevel(congested.level)}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if currentTimelineFrame && currentTimelineFrame.cartStates.length > 0}
						<div class="space-y-1">
							<p class="text-xs font-medium text-primary-700">
								🚚 当前小车状态 ({currentTimelineFrame.cartStates.length})
							</p>
							<div class="space-y-1 max-h-32 overflow-y-auto">
								{#each currentTimelineFrame.cartStates as cart (cart.cartId)}
									<div
										class="p-1.5 rounded text-xs"
										class:bg-amber-50={cart.isWaiting}
										class:bg-surface-50={!cart.isWaiting}
									>
										<div class="flex items-center gap-2">
											<div
												class="w-3 h-3 rounded-full border border-gray-700 flex-shrink-0"
												style="background-color: {cart.color}"
											></div>
											<span class="font-medium flex-shrink-0">{cart.cartName}</span>
											<span
												class="ml-auto text-xs px-1.5 py-0.5 rounded"
												class:bg-amber-100={cart.isWaiting}
												class:text-amber-700={cart.isWaiting}
												class:bg-surface-200={!cart.isWaiting && cart.nextNodeId}
												class:text-tertiary-600={!cart.isWaiting && cart.nextNodeId}
												class:bg-green-100={!cart.isWaiting && !cart.nextNodeId}
												class:text-green-700={!cart.isWaiting && !cart.nextNodeId}
											>
												{#if cart.isWaiting}⏳ 等待
												{:else if cart.nextNodeId}🚚 行驶中
												{:else}✓ 到达
												{/if}
											</span>
										</div>
										{#if cart.isWaiting}
											<div class="text-xs text-amber-600 mt-0.5 ml-5">
												在 {cart.waitNodeLabel} · 剩 {cart.waitRemaining.toFixed(1)}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if currentTimelineFrame && currentTimelineFrame.events.length > 0}
						<div class="space-y-1">
							<p class="text-xs font-medium text-primary-700">📌 实时事件</p>
							<div class="space-y-1 max-h-28 overflow-y-auto">
								{#each currentTimelineFrame.events as event}
									<div
										class={`p-1.5 rounded text-xs border-l-2 ${getEventTypeColor(event.type)}`}
									>
										{event.description}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="space-y-1">
						<p class="text-xs font-medium text-primary-700">故障时间线</p>
						<div class="space-y-1 max-h-40 overflow-y-auto">
							{#each faultsArray as fault}
								<div
									class={`p-2 rounded text-xs border-l-4 ${
										currentTimelineFrame?.resolvedFaultIds.includes(fault.id)
											? 'bg-success-50 border-success-400'
											: currentTimelineFrame?.repairingFaultIds.includes(fault.id)
												? 'bg-warning-50 border-warning-400'
												: currentTimelineFrame?.activeFaultIds.includes(fault.id)
													? 'bg-error-50 border-error-400'
													: 'bg-surface-50 border-surface-300'
									}`}
								>
									<div class="flex items-center justify-between">
										<span class="font-medium">{fault.faultTypeName}</span>
										<span class="text-tertiary-500 text-xs">
											{currentTimelineFrame?.resolvedFaultIds.includes(fault.id)
												? '✓ 已修复'
												: currentTimelineFrame?.repairingFaultIds.includes(fault.id)
													? '🔧 抢修中'
													: currentTimelineFrame?.activeFaultIds.includes(fault.id)
														? '⚠ 进行中'
														: '⏳ 未发生'}
										</span>
									</div>
									<div class="text-tertiary-500 text-xs mt-0.5">
										位置: {fault.targetLabel}
									</div>
									<div class="text-tertiary-400 text-xs mt-0.5">
										发生 T={fault.occurrenceTime} · 修复需时 {fault.repairDuration}
									</div>
								</div>
							{/each}
						</div>
					</div>

					<div class="text-xs text-tertiary-400 text-center pt-1">
						💡 播放时左侧地图同步显示小车运行、故障状态和拥堵变化
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>