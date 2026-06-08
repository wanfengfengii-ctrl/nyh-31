<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import {
		carts,
		dispatchResult,
		nodes,
		edges
	} from '$lib/stores';
	import { generatePlaybackFrames } from '$lib/dispatch';
	import type { PlaybackFrame, PlaybackEvent } from '$lib/types';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{
		frameChange: PlaybackFrame;
		playbackStart: void;
		playbackStop: void;
	}>();

	let isPlaying = false;
	let currentFrameIndex = 0;
	let playbackSpeed = 1;
	let frames: PlaybackFrame[] = [];
	let animationFrameId: number | null = null;
	let lastTime = 0;
	let accumulatedTime = 0;

	$: result = $dispatchResult;
	$: currentFrame = frames[currentFrameIndex] || null;
	$: totalFrames = frames.length;
	$: progress = totalFrames > 0 ? (currentFrameIndex / (totalFrames - 1)) * 100 : 0;
	$: currentTime = currentFrame?.time ?? 0;

	$: {
		if ($carts.length > 0 && result.hasAllPaths) {
			const $nodes = get(nodes);
			const $edges = get(edges);
			frames = generatePlaybackFrames($nodes, $edges, $carts, result, 0.5);
		} else {
			frames = [];
		}
		currentFrameIndex = 0;
		isPlaying = false;
	}

	$: if (currentFrame) {
		dispatch('frameChange', currentFrame);
	}

	function togglePlay() {
		if (frames.length === 0) return;

		if (isPlaying) {
			pausePlayback();
		} else {
			startPlayback();
		}
	}

	function startPlayback() {
		if (currentFrameIndex >= frames.length - 1) {
			currentFrameIndex = 0;
		}
		isPlaying = true;
		lastTime = performance.now();
		accumulatedTime = 0;
		dispatch('playbackStart');
		requestAnimationFrame(animate);
	}

	function pausePlayback() {
		isPlaying = false;
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		dispatch('playbackStop');
	}

	function animate(timestamp: number) {
		if (!isPlaying) return;

		const deltaTime = timestamp - lastTime;
		lastTime = timestamp;
		accumulatedTime += deltaTime * playbackSpeed * 0.05;

		const frameIndex = Math.min(
			Math.floor(accumulatedTime) + currentFrameIndex,
			frames.length - 1
		);

		if (frameIndex !== currentFrameIndex) {
			currentFrameIndex = frameIndex;
			accumulatedTime = 0;
		}

		if (currentFrameIndex >= frames.length - 1) {
			isPlaying = false;
			dispatch('playbackStop');
			return;
		}

		animationFrameId = requestAnimationFrame(animate);
	}

	function resetPlayback() {
		pausePlayback();
		currentFrameIndex = 0;
		accumulatedTime = 0;
	}

	function handleSliderChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const index = parseInt(target.value);
		currentFrameIndex = index;
		accumulatedTime = 0;
	}

	function stepForward() {
		if (currentFrameIndex < frames.length - 1) {
			currentFrameIndex++;
		}
	}

	function stepBackward() {
		if (currentFrameIndex > 0) {
			currentFrameIndex--;
		}
	}

	function setSpeed(speed: number) {
		playbackSpeed = speed;
	}

	$: recentEvents = currentFrame?.events || [];

	$: allEvents = (() => {
		const events: PlaybackEvent[] = [];
		for (const frame of frames) {
			events.push(...frame.events);
		}
		return events;
	})();

	onMount(() => {
	});

	onDestroy(() => {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
		}
	});
</script>

<div class="card p-4 space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-bold text-primary-900">🎬 运输过程回放</h3>
	</div>

	{#if frames.length === 0}
		<div class="text-center py-6">
			<p class="text-sm text-tertiary-500">暂无可回放的调度数据</p>
			<p class="text-xs text-tertiary-400 mt-1">请先配置小车并确保路径可达</p>
		</div>
	{:else}
		<div class="bg-primary-50 p-3 rounded-lg">
			<div class="flex items-center justify-between mb-2">
				<span class="text-sm font-medium text-primary-700">
					时间: {currentTime.toFixed(1)} / {frames[frames.length - 1]?.time.toFixed(1) || 0}
				</span>
				<span class="text-xs text-tertiary-500">
					帧 {currentFrameIndex + 1} / {totalFrames}
				</span>
			</div>

			<input
				type="range"
				min="0"
				max={totalFrames - 1}
				value={currentFrameIndex}
				on:input={handleSliderChange}
				class="w-full"
				disabled={totalFrames <= 1}
			/>
		</div>

		<div class="flex items-center justify-center gap-2">
			<button
				class="btn btn-sm variant-soft"
				on:click={stepBackward}
				disabled={currentFrameIndex === 0}
			>
				⏮
			</button>
			<button
				class="btn btn-sm variant-filled-primary px-6"
				on:click={togglePlay}
				disabled={totalFrames <= 1}
			>
				{isPlaying ? '⏸ 暂停' : '▶ 播放'}
			</button>
			<button
				class="btn btn-sm variant-soft"
				on:click={stepForward}
				disabled={currentFrameIndex >= totalFrames - 1}
			>
				⏭
			</button>
			<button
				class="btn btn-sm variant-soft"
				on:click={resetPlayback}
				title="重置"
			>
				↺
			</button>
		</div>

		<div class="flex items-center justify-center gap-2">
			<span class="text-xs text-tertiary-500">速度:</span>
			{#each [0.5, 1, 2, 4] as speed}
				<button
					class="btn btn-xs"
					class:variant-filled-secondary={playbackSpeed === speed}
					class:variant-soft={playbackSpeed !== speed}
					on:click={() => setSpeed(speed)}
				>
					{speed}x
				</button>
			{/each}
		</div>

		<div>
			<p class="text-sm font-medium text-primary-700 mb-2">
				当前小车状态 ({currentFrame?.cartStates.length || 0})
			</p>
			<div class="space-y-1.5 max-h-40 overflow-y-auto">
				{#if currentFrame?.cartStates.length === 0}
					<p class="text-xs text-tertiary-500 text-center py-2">暂无小车</p>
				{:else}
					{#each currentFrame.cartStates as cartState (cartState.cartId)}
						<div
							class="p-2 rounded text-xs"
							class:bg-amber-50={cartState.isWaiting}
							class:bg-surface-50={!cartState.isWaiting}
							class:border-l-2={cartState.isWaiting}
							class:border-l-amber-500={cartState.isWaiting}
						>
							<div class="flex items-center gap-2 mb-1">
								<div
									class="w-3 h-3 rounded-full border border-gray-700 flex-shrink-0"
									class:animate-pulse={cartState.isWaiting}
									style="background-color: {cartState.color}"
								></div>
								<span class="font-medium flex-shrink-0">{cartState.cartName}</span>
								<span
									class="ml-auto text-xs px-1.5 py-0.5 rounded"
									class:bg-amber-100={cartState.isWaiting}
									class:text-amber-700={cartState.isWaiting}
									class:bg-surface-200={!cartState.isWaiting && cartState.nextNodeId}
									class:text-tertiary-600={!cartState.isWaiting && cartState.nextNodeId}
									class:bg-green-100={!cartState.isWaiting && !cartState.nextNodeId}
									class:text-green-700={!cartState.isWaiting && !cartState.nextNodeId}
								>
									{#if cartState.isWaiting}
										⏳ 等待中
									{:else if cartState.nextNodeId}
										🚚 行驶中
									{:else}
										✓ 已到达
									{/if}
								</span>
							</div>
							{#if cartState.isWaiting}
								<div class="text-xs text-amber-700">
									在 <span class="font-medium">{cartState.waitNodeLabel}</span> 等待
								</div>
								<div class="text-xs text-amber-600 mt-0.5">
									剩余等待: <span class="font-mono">{cartState.waitRemaining.toFixed(1)}</span> 单位时间
								</div>
								<div class="mt-1 h-1 bg-amber-200 rounded-full overflow-hidden">
									<div
										class="h-full bg-amber-500 transition-all duration-200"
										style="width: {Math.max(0, Math.min(100, (1 - cartState.waitRemaining / Math.max(cartState.waitRemaining + 0.1, 1)) * 100))}%"
									></div>
								</div>
							{:else if cartState.nextNodeId}
								<div class="text-xs text-tertiary-600">
									下一站: <span class="font-medium">{cartState.nextNodeId.slice(0, 8)}</span>
								</div>
								<div class="mt-1 h-1 bg-surface-200 rounded-full overflow-hidden">
									<div
										class="h-full bg-primary-500 transition-all duration-200"
										style="width: {cartState.progress * 100}%"
									></div>
								</div>
								<div class="text-xs text-tertiary-400 mt-0.5 text-right">
									{(cartState.progress * 100).toFixed(0)}%
								</div>
							{:else}
								<div class="text-xs text-green-600">已抵达终点</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<div>
			<p class="text-sm font-medium text-primary-700 mb-2">
				事件日志 ({allEvents.length})
			</p>
			<div class="space-y-1 max-h-40 overflow-y-auto">
				{#if allEvents.length === 0}
					<p class="text-xs text-tertiary-500 text-center py-2">暂无事件</p>
				{:else}
					{#each allEvents as event, idx}
						<div
							class="p-1.5 rounded text-xs"
							class:bg-error-50={event.type === 'conflict'}
							class:bg-amber-50={event.type === 'wait'}
							class:bg-warning-50={event.type === 'switch'}
							class:bg-info-50={event.type === 'depart' || event.type === 'arrive'}
							class:border-l-2={true}
							class:border-l-error-500={event.type === 'conflict'}
							class:border-l-amber-500={event.type === 'wait'}
							class:border-l-warning-500={event.type === 'switch'}
							class:border-l-info-500={event.type === 'depart' || event.type === 'arrive'}
						>
							<span class="text-tertiary-500">[{event.time.toFixed(1)}]</span>
							<span class="ml-1">{event.description}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		{#if currentFrame && currentFrame.congestedEdges.length > 0}
			<div class="bg-warning-50 p-2 rounded-lg">
				<p class="text-xs font-medium text-warning-700 mb-1">
					⚠ 当前拥堵轨道 ({currentFrame.congestedEdges.length})
				</p>
				{#each currentFrame.congestedEdges as congested}
					<div class="text-xs text-warning-600">
						轨道 {congested.edgeId.slice(0, 8)}: {congested.level} 辆车
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
