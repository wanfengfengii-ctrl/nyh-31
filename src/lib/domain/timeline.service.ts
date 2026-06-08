// ============================================================================
//  时间轴 / 回放服务 (Timeline Service)
// ============================================================================
//  提供时间轴与回放相关的核心领域服务：
//    - 调度回放帧生成 (generatePlaybackFrames)
//    - 故障时间轴生成 (generateFaultTimeline)
//    - 故障回放帧生成 (generateFaultPlaybackFrames)
//    - 综合回放帧生成 (generateIntegratedPlayback)
//    - 小车位置计算 (getCartPositionAtTime)
// ============================================================================

import type {
	MineNode,
	MineEdge,
	Cart,
	CartRoute,
	DispatchResult,
	Fault,
	FaultTimelineEvent,
	PlaybackFrame,
	PlaybackEvent,
	IntegratedPlaybackFrame,
	FaultStatus
} from './models';
import { buildNodeMap } from './network.service';
import { calculateDispatch } from './dispatch.service';
import {
	applyFaultsToNetwork,
	getFaultStatusAtTime
} from './fault.service';

// ============================================================================
//  调度回放帧生成
// ============================================================================

/**
 * 生成调度回放帧序列
 * 每一帧包含当前时刻所有小车的位置、拥堵的轨道、以及事件
 */
export function generatePlaybackFrames(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	dispatchResult: DispatchResult,
	frameInterval: number = 0.5
): PlaybackFrame[] {
	const frames: PlaybackFrame[] = [];
	const nodeMap = buildNodeMap(nodes);
	const cartMap = new Map(carts.map((c) => [c.id, c]));
	const triggeredEvents = new Set<string>();

	if (dispatchResult.routes.length === 0) return frames;

	const maxTime = Math.max(
		...dispatchResult.routes.map((r) =>
			r.positions.length > 0 ? r.positions[r.positions.length - 1].departureTime : 0
		)
	);

	if (!isFinite(maxTime) || maxTime <= 0) return frames;

	for (let time = 0; time <= maxTime + frameInterval; time += frameInterval) {
		const cartStates: PlaybackFrame['cartStates'] = [];
		const congestedEdges: Map<string, number> = new Map();
		const events: PlaybackEvent[] = [];

		for (const route of dispatchResult.routes) {
			const cart = cartMap.get(route.cartId);
			if (!cart || !route.hasPath || route.positions.length === 0) continue;

			const positionInfo = calculateCartPositionAtTime(
				route,
				time,
				nodeMap
			);

			cartStates.push({
				cartId: cart.id,
				cartName: cart.name,
				x: positionInfo.x,
				y: positionInfo.y,
				currentNodeId: positionInfo.currentNodeId,
				nextNodeId: positionInfo.nextNodeId,
				progress: positionInfo.progress,
				isWaiting: positionInfo.isWaiting,
				waitRemaining: positionInfo.waitRemaining,
				waitNodeLabel: positionInfo.waitNodeLabel,
				color: cart.color
			});

			// 统计拥堵轨道
			if (!positionInfo.isWaiting && positionInfo.edgeId) {
				const currentCount = congestedEdges.get(positionInfo.edgeId) || 0;
				congestedEdges.set(positionInfo.edgeId, currentCount + 1);
			}

			// 生成事件
			generateCartEvents(route, cart, time, frameInterval, triggeredEvents, events, nodeMap);
		}

		// 冲突事件
		for (const conflict of dispatchResult.conflicts) {
			const conflictEventKey = `conflict_${conflict.id}`;
			if (
				time >= conflict.startTime &&
				time < conflict.startTime + frameInterval &&
				!triggeredEvents.has(conflictEventKey)
			) {
				triggeredEvents.add(conflictEventKey);
				events.push({
					time,
					type: 'conflict',
					cartId: conflict.cart1Id,
					cartName: conflict.cart1Name,
					description: `⚠ ${conflict.description}`
				});
			}
		}

		const congestedEdgesList = Array.from(congestedEdges.entries())
			.filter(([, count]) => count > 1)
			.map(([edgeId, count]) => ({ edgeId, level: count }));

		frames.push({
			time,
			cartStates,
			congestedEdges: congestedEdgesList,
			events
		});
	}

	return frames;
}

// ============================================================================
//  小车位置计算
// ============================================================================

interface CartPositionInfo {
	x: number;
	y: number;
	currentNodeId: string;
	nextNodeId: string | null;
	progress: number;
	isWaiting: boolean;
	waitRemaining: number;
	waitNodeLabel: string;
	edgeId: string | null;
}

/**
 * 计算某一时刻小车的位置
 */
function calculateCartPositionAtTime(
	route: CartRoute,
	time: number,
	nodeMap: Map<string, MineNode>
): CartPositionInfo {
	const positions = route.positions;

	// 出发前
	if (time < positions[0].arrivalTime) {
		const node = nodeMap.get(positions[0].nodeId);
		return {
			x: node?.x || 0,
			y: node?.y || 0,
			currentNodeId: positions[0].nodeId,
			nextNodeId: positions.length > 1 ? positions[1].nodeId : null,
			progress: 0,
			isWaiting: true,
			waitRemaining: positions[0].arrivalTime - time,
			waitNodeLabel: node?.label || '',
			edgeId: null
		};
	}

	// 遍历位置点
	for (let i = 0; i < positions.length; i++) {
		const pos = positions[i];

		// 在节点等待
		if (time >= pos.arrivalTime && time < pos.departureTime) {
			const node = nodeMap.get(pos.nodeId);
			return {
				x: node?.x || 0,
				y: node?.y || 0,
				currentNodeId: pos.nodeId,
				nextNodeId: i < positions.length - 1 ? positions[i + 1].nodeId : null,
				progress: 0,
				isWaiting: true,
				waitRemaining: pos.departureTime - time,
				waitNodeLabel: node?.label || '',
				edgeId: null
			};
		}

		// 在轨道上行驶
		if (i < positions.length - 1) {
			const nextPos = positions[i + 1];
			if (time >= pos.departureTime && time <= nextPos.arrivalTime) {
				const currNode = nodeMap.get(pos.nodeId);
				const nextNode = nodeMap.get(nextPos.nodeId);
				const segmentDuration = nextPos.arrivalTime - pos.departureTime;
				const progress = segmentDuration > 0
					? (time - pos.departureTime) / segmentDuration
					: 0;
				const clampedProgress = Math.max(0, Math.min(1, progress));

				return {
					x: currNode && nextNode
						? currNode.x + (nextNode.x - currNode.x) * clampedProgress
						: currNode?.x || 0,
					y: currNode && nextNode
						? currNode.y + (nextNode.y - currNode.y) * clampedProgress
						: currNode?.y || 0,
					currentNodeId: pos.nodeId,
					nextNodeId: nextPos.nodeId,
					progress: clampedProgress,
					isWaiting: false,
					waitRemaining: 0,
					waitNodeLabel: '',
					edgeId: nextPos.edgeId || null
				};
			}
		}
	}

	// 已到达终点
	const lastPos = positions[positions.length - 1];
	const lastNode = nodeMap.get(lastPos.nodeId);
	return {
		x: lastNode?.x || 0,
		y: lastNode?.y || 0,
		currentNodeId: lastPos.nodeId,
		nextNodeId: null,
		progress: 1,
		isWaiting: false,
		waitRemaining: 0,
		waitNodeLabel: '',
		edgeId: null
	};
}

/**
 * 生成小车相关事件（出发、到达、等待、道岔）
 */
function generateCartEvents(
	route: CartRoute,
	cart: Cart,
	time: number,
	frameInterval: number,
	triggeredEvents: Set<string>,
	events: PlaybackEvent[],
	nodeMap: Map<string, MineNode>
): void {
	const positions = route.positions;
	if (positions.length === 0) return;

	// 出发事件
	const departEventKey = `depart_${cart.id}`;
	if (
		time >= positions[0].departureTime &&
		time < positions[0].departureTime + frameInterval &&
		!triggeredEvents.has(departEventKey)
	) {
		triggeredEvents.add(departEventKey);
		events.push({
			time,
			type: 'depart',
			cartId: cart.id,
			cartName: cart.name,
			description: `${cart.name} 从起点出发`
		});
	}

	// 到达 / 道岔事件
	for (let i = 1; i < positions.length; i++) {
		const pos = positions[i];
		const arriveEventKey = `arrive_${cart.id}_${i}`;
		if (
			time >= pos.arrivalTime &&
			time < pos.arrivalTime + frameInterval &&
			!triggeredEvents.has(arriveEventKey)
		) {
			triggeredEvents.add(arriveEventKey);
			const node = nodeMap.get(pos.nodeId);
			events.push({
				time,
				type: 'arrive',
				cartId: cart.id,
				cartName: cart.name,
				description: `${cart.name} 到达节点 ${node?.label || pos.nodeId.slice(0, 8)}`
			});
			if (pos.isSwitch) {
				events.push({
					time,
					type: 'switch',
					cartId: cart.id,
					cartName: cart.name,
					description: `${cart.name} 经过岔道节点`
				});
			}
		}
	}

	// 等待事件
	for (let i = 0; i < positions.length; i++) {
		const pos = positions[i];
		if (time >= pos.arrivalTime && time < pos.departureTime) {
			const eventKey = `wait_start_${cart.id}_${i}`;
			if (!triggeredEvents.has(eventKey) && time >= pos.arrivalTime && time < pos.arrivalTime + frameInterval) {
				triggeredEvents.add(eventKey);
				const node = nodeMap.get(pos.nodeId);
				const waitRemaining = pos.departureTime - time;
				events.push({
					time,
					type: 'wait',
					cartId: cart.id,
					cartName: cart.name,
					description: `${cart.name} 在节点 ${node?.label || pos.nodeId.slice(0, 8)} 等待 ${waitRemaining.toFixed(1)} 单位时间`
				});
			}
			break;
		}
	}
}

// ============================================================================
//  故障时间轴
// ============================================================================

interface FaultTimeEvent {
	type: string;
	faultId: string;
}

export function generateFaultTimeline(
	faults: Fault[],
	totalDuration: number
): { time: number; events: { type: string; faultId: string; faultName: string }[] }[] {
	const timeline: {
		time: number;
		events: { type: string; faultId: string; faultName: string }[];
	}[] = [];

	const timeEvents = new Map<
		number,
		{ type: string; faultId: string; faultName: string }[]
	>();

	faults.forEach((fault) => {
		if (!timeEvents.has(fault.occurrenceTime)) {
			timeEvents.set(fault.occurrenceTime, []);
		}
		timeEvents.get(fault.occurrenceTime)!.push({
			type: 'fault-occur',
			faultId: fault.id,
			faultName: fault.faultTypeName
		});

		const repairStartTime = fault.repairStartTime ?? fault.occurrenceTime + 5;
		if (!timeEvents.has(repairStartTime)) {
			timeEvents.set(repairStartTime, []);
		}
		timeEvents.get(repairStartTime)!.push({
			type: 'repair-start',
			faultId: fault.id,
			faultName: fault.faultTypeName
		});

		const repairEndTime = repairStartTime + fault.repairDuration;
		if (!timeEvents.has(repairEndTime)) {
			timeEvents.set(repairEndTime, []);
		}
		timeEvents.get(repairEndTime)!.push({
			type: 'repair-complete',
			faultId: fault.id,
			faultName: fault.faultTypeName
		});
	});

	const sortedTimes = Array.from(timeEvents.keys()).sort((a, b) => a - b);

	sortedTimes.forEach((time) => {
		if (time <= totalDuration) {
			timeline.push({
				time,
				events: timeEvents.get(time)!
			});
		}
	});

	return timeline;
}

// ============================================================================
//  故障回放帧生成
// ============================================================================

export function generateFaultPlaybackFrames(
	nodes: MineNode[],
	edges: MineEdge[],
	faults: Fault[],
	frameInterval: number = 0.5
): {
	time: number;
	phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered';
	activeFaultIds: string[];
	repairingFaultIds: string[];
	resolvedFaultIds: string[];
	nodes: MineNode[];
	edges: MineEdge[];
	events: { type: string; faultId: string; faultName: string; targetLabel: string }[];
}[] {
	const frames: {
		time: number;
		phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered';
		activeFaultIds: string[];
		repairingFaultIds: string[];
		resolvedFaultIds: string[];
		nodes: MineNode[];
		edges: MineEdge[];
		events: { type: string; faultId: string; faultName: string; targetLabel: string }[];
	}[] = [];

	if (faults.length === 0) return frames;

	const timeEvents = new Map<number, { type: string; faultId: string }[]>();

	faults.forEach((fault) => {
		if (!timeEvents.has(fault.occurrenceTime)) {
			timeEvents.set(fault.occurrenceTime, []);
		}
		timeEvents.get(fault.occurrenceTime)!.push({
			type: 'fault-occur',
			faultId: fault.id
		});

		const repairStartTime = fault.repairStartTime ?? fault.occurrenceTime + 5;
		if (!timeEvents.has(repairStartTime)) {
			timeEvents.set(repairStartTime, []);
		}
		timeEvents.get(repairStartTime)!.push({
			type: 'repair-start',
			faultId: fault.id
		});

		const repairEndTime = repairStartTime + fault.repairDuration;
		if (!timeEvents.has(repairEndTime)) {
			timeEvents.set(repairEndTime, []);
		}
		timeEvents.get(repairEndTime)!.push({
			type: 'repair-complete',
			faultId: fault.id
		});
	});

	const sortedTimes = Array.from(timeEvents.keys()).sort((a, b) => a - b);
	const firstEventTime = sortedTimes.length > 0 ? sortedTimes[0] : 0;
	const lastEventTime =
		sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 100;

	const startTime = Math.max(0, firstEventTime - 10);
	const endTime = lastEventTime + 10;

	const occurredFaults = new Set<string>();
	const repairingFaults = new Set<string>();
	const resolvedFaults = new Set<string>();

	let eventIndex = 0;

	for (let time = startTime; time <= endTime; time += frameInterval) {
		const frameEvents: {
			type: string;
			faultId: string;
			faultName: string;
			targetLabel: string;
		}[] = [];

		while (eventIndex < sortedTimes.length && sortedTimes[eventIndex] <= time) {
			const eventTime = sortedTimes[eventIndex];
			const events = timeEvents.get(eventTime) || [];

			events.forEach((event) => {
				const fault = faults.find((f) => f.id === event.faultId);
				if (!fault) return;

				if (event.type === 'fault-occur') {
					occurredFaults.add(fault.id);
					frameEvents.push({
						type: 'fault-occur',
						faultId: fault.id,
						faultName: fault.faultTypeName,
						targetLabel: fault.targetLabel
					});
				} else if (event.type === 'repair-start') {
					repairingFaults.add(fault.id);
					frameEvents.push({
						type: 'repair-start',
						faultId: fault.id,
						faultName: fault.faultTypeName,
						targetLabel: fault.targetLabel
					});
				} else if (event.type === 'repair-complete') {
					resolvedFaults.add(fault.id);
					repairingFaults.delete(fault.id);
					frameEvents.push({
						type: 'repair-complete',
						faultId: fault.id,
						faultName: fault.faultTypeName,
						targetLabel: fault.targetLabel
					});
				}
			});

			eventIndex++;
		}

		let phase: 'normal' | 'fault-occurring' | 'fault-active' | 'repairing' | 'recovered';

		if (occurredFaults.size === 0) {
			phase = 'normal';
		} else if (resolvedFaults.size === faults.length) {
			phase = 'recovered';
		} else if (repairingFaults.size > 0) {
			phase = 'repairing';
		} else if (frameEvents.some((e) => e.type === 'fault-occur')) {
			phase = 'fault-occurring';
		} else {
			phase = 'fault-active';
		}

		const activeFaultsForFrame = faults.filter(
			(f) => occurredFaults.has(f.id) && !resolvedFaults.has(f.id)
		);

		const { nodes: frameNodes, edges: frameEdges } = applyFaultsToNetwork(
			nodes,
			edges,
			activeFaultsForFrame,
			time
		);

		frames.push({
			time,
			phase,
			activeFaultIds: Array.from(occurredFaults).filter((id) => !resolvedFaults.has(id)),
			repairingFaultIds: Array.from(repairingFaults),
			resolvedFaultIds: Array.from(resolvedFaults),
			nodes: frameNodes,
			edges: frameEdges,
			events: frameEvents
		});
	}

	return frames;
}

// ============================================================================
//  综合回放（故障 + 调度）
// ============================================================================

/**
 * 生成综合回放帧（包含故障演进和小车调度）
 */
export function generateIntegratedPlayback(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	faults: Fault[],
	frameInterval: number = 0.5
): IntegratedPlaybackFrame[] {
	const frames: IntegratedPlaybackFrame[] = [];

	if (carts.length === 0 && faults.length === 0) return frames;

	const normalResult = calculateDispatch(nodes, edges, carts);
	const normalFrames = generatePlaybackFrames(nodes, edges, carts, normalResult, frameInterval);

	const faultTimeEvents = new Map<number, { type: string; faultId: string }[]>();

	faults.forEach((fault) => {
		if (!faultTimeEvents.has(fault.occurrenceTime)) {
			faultTimeEvents.set(fault.occurrenceTime, []);
		}
		faultTimeEvents.get(fault.occurrenceTime)!.push({
			type: 'fault-occur',
			faultId: fault.id
		});

		const repairStartTime = fault.repairStartTime ?? fault.occurrenceTime + 5;
		if (!faultTimeEvents.has(repairStartTime)) {
			faultTimeEvents.set(repairStartTime, []);
		}
		faultTimeEvents.get(repairStartTime)!.push({
			type: 'repair-start',
			faultId: fault.id
		});

		const repairEndTime = repairStartTime + fault.repairDuration;
		if (!faultTimeEvents.has(repairEndTime)) {
			faultTimeEvents.set(repairEndTime, []);
		}
		faultTimeEvents.get(repairEndTime)!.push({
			type: 'repair-complete',
			faultId: fault.id
		});
	});

	const allEventTimes = Array.from(faultTimeEvents.keys()).sort((a, b) => a - b);
	const maxNormalTime = normalFrames.length > 0
		? normalFrames[normalFrames.length - 1].time
		: 50;
	const maxFaultTime = allEventTimes.length > 0
		? allEventTimes[allEventTimes.length - 1] + 10
		: 0;
	const totalDuration = Math.max(maxNormalTime, maxFaultTime, 50);

	const occurredFaults = new Set<string>();
	const repairingFaults = new Set<string>();
	const resolvedFaults = new Set<string>();
	const triggeredEvents = new Set<string>();

	let eventIndex = 0;
	let dispatchCache: { time: number; result: DispatchResult } | null = null;

	for (let time = 0; time <= totalDuration + frameInterval; time += frameInterval) {
		const frameEvents: FaultTimelineEvent[] = [];

		// 处理故障事件
		while (eventIndex < allEventTimes.length && allEventTimes[eventIndex] <= time) {
			const eventTime = allEventTimes[eventIndex];
			const events = faultTimeEvents.get(eventTime) || [];

			events.forEach((event) => {
				const fault = faults.find((f) => f.id === event.faultId);
				if (!fault) return;

				if (event.type === 'fault-occur') {
					occurredFaults.add(fault.id);
					frameEvents.push({
						time: eventTime,
						type: 'fault-occur',
						faultId: fault.id,
						faultName: fault.faultTypeName,
						description: `⚠ 故障发生: ${fault.faultTypeName} - ${fault.targetLabel}`,
						severity: fault.severity === 'critical'
							? 'high'
							: fault.severity === 'major'
								? 'medium'
								: 'low'
					});
				} else if (event.type === 'repair-start') {
					repairingFaults.add(fault.id);
					frameEvents.push({
						time: eventTime,
						type: 'repair-start',
						faultId: fault.id,
						faultName: fault.faultTypeName,
						description: `🔧 开始抢修: ${fault.faultTypeName} - ${fault.targetLabel}`,
						severity: 'medium'
					});
				} else if (event.type === 'repair-complete') {
					resolvedFaults.add(fault.id);
					repairingFaults.delete(fault.id);
					frameEvents.push({
						time: eventTime,
						type: 'repair-complete',
						faultId: fault.id,
						faultName: fault.faultTypeName,
						description: `✓ 修复完成: ${fault.faultTypeName} - ${fault.targetLabel}`,
						severity: 'low'
					});
				}
			});

			eventIndex++;
		}

		let phase: IntegratedPlaybackFrame['phase'] = 'normal';

		if (occurredFaults.size === 0) {
			phase = 'normal';
		} else if (resolvedFaults.size === faults.length) {
			phase = 'recovered';
		} else if (repairingFaults.size > 0) {
			phase = 'repairing';
		} else if (frameEvents.some((e) => e.type === 'fault-occur')) {
			phase = 'fault-occurring';
		} else {
			phase = 'fault-active';
		}

		const activeFaultsForFrame = faults.filter(
			(f) => occurredFaults.has(f.id) && !resolvedFaults.has(f.id)
		);

		const { nodes: frameNodes, edges: frameEdges } = applyFaultsToNetwork(
			nodes,
			edges,
			activeFaultsForFrame,
			time
		);

		// 缓存调度结果，避免重复计算
		if (
			!dispatchCache ||
			Math.abs(dispatchCache.time - time) > frameInterval * 2 ||
			frameEvents.some((e) => e.type === 'fault-occur' || e.type === 'repair-complete')
		) {
			const dispatchResult = calculateDispatch(frameNodes, frameEdges, carts);
			dispatchCache = { time, result: dispatchResult };
		}

		const currentDispatch = dispatchCache.result;
		const cartFrames = generatePlaybackFrames(
			frameNodes,
			frameEdges,
			carts,
			currentDispatch,
			frameInterval
		);

		let cartStates: IntegratedPlaybackFrame['cartStates'] = [];
		let congestedEdges: IntegratedPlaybackFrame['congestedEdges'] = [];

		if (cartFrames.length > 0) {
			const closestIdx = Math.min(
				Math.floor(time / frameInterval),
				cartFrames.length - 1
			);
			const cartFrame = cartFrames[Math.max(0, closestIdx)];
			if (cartFrame) {
				cartStates = cartFrame.cartStates;
				congestedEdges = cartFrame.congestedEdges;
			}
		}

		// 维修进度
		const repairProgress = faults
			.filter((f) => repairingFaults.has(f.id))
			.map((f) => {
				const repairStart = f.repairStartTime ?? f.occurrenceTime + 5;
				const elapsed = time - repairStart;
				const progress = Math.max(0, Math.min(1, elapsed / f.repairDuration));
				const remaining = Math.max(0, f.repairDuration - elapsed);
				return {
					faultId: f.id,
					progress,
					remainingTime: remaining
				};
			});

		// 拥堵警告
		if (congestedEdges.length > 0) {
			const heavyCongestion = congestedEdges.filter((c) => c.level >= 3);
			if (heavyCongestion.length > 0) {
				const key = `congestion_${time.toFixed(1)}`;
				if (!triggeredEvents.has(key)) {
					triggeredEvents.add(key);
					frameEvents.push({
						time,
						type: 'congestion-warning',
						description: `⚠ 拥堵警告: ${heavyCongestion.length} 条轨道严重拥堵`,
						severity: 'medium'
					});
				}
			}
		}

		frames.push({
			time,
			phase,
			cartStates,
			congestedEdges,
			activeFaultIds: Array.from(occurredFaults).filter((id) => !resolvedFaults.has(id)),
			repairingFaultIds: Array.from(repairingFaults),
			resolvedFaultIds: Array.from(resolvedFaults),
			repairProgress,
			events: frameEvents,
			nodes: frameNodes,
			edges: frameEdges,
			dispatchResultSnapshot: currentDispatch
		});
	}

	return frames;
}

// ============================================================================
//  获取指定时间的小车位置（外部调用接口）
// ============================================================================

export function getCartPositionAtTime(
	route: CartRoute,
	time: number,
	nodes: MineNode[]
): {
	nodeId: string;
	edgeId: string | null;
	progress: number;
	isWaiting: boolean;
	x: number;
	y: number;
} {
	const nodeMap = buildNodeMap(nodes);

	if (!route.hasPath || route.positions.length === 0) {
		const firstNode = nodes[0];
		return {
			nodeId: firstNode?.id || '',
			edgeId: null,
			progress: 0,
			isWaiting: true,
			x: firstNode?.x || 0,
			y: firstNode?.y || 0
		};
	}

	const info = calculateCartPositionAtTime(route, time, nodeMap);
	return {
		nodeId: info.currentNodeId,
		edgeId: info.edgeId,
		progress: info.progress,
		isWaiting: info.isWaiting,
		x: info.x,
		y: info.y
	};
}
