import {
	calculateDispatch as domainCalculateDispatch,
	detectConflicts as domainDetectConflicts,
	resolveConflictsWithPriority as domainResolveConflictsWithPriority,
	getDefaultCarts as domainGetDefaultCarts,
	createNewCart as domainCreateNewCart
} from './domain/dispatch.service';
import {
	buildTimedRoute as domainBuildTimedRoute
} from './domain/pathfinding.service';
import {
	generatePlaybackFrames as domainGeneratePlaybackFrames
} from './domain/timeline.service';
import type {
	MineNode,
	MineEdge,
	Cart,
	CartRoute,
	TimedPosition,
	Conflict,
	DispatchResult,
	PlaybackFrame,
	PlaybackEvent
} from './types';

// 重新导出所有函数，保持接口完全兼容
export {
	buildTimedRoute,
	detectConflicts,
	resolveConflictsWithPriority,
	calculateDispatch,
	generatePlaybackFrames,
	getDefaultCarts,
	createNewCart
};

function buildTimedRoute(
	nodes: MineNode[],
	edges: MineEdge[],
	cart: Cart
): CartRoute {
	return domainBuildTimedRoute(nodes, edges, cart);
}

function detectConflicts(
	routes: CartRoute[],
	edges: MineEdge[],
	carts: Cart[]
): Conflict[] {
	return domainDetectConflicts(routes, edges, carts);
}

function resolveConflictsWithPriority(
	routes: CartRoute[],
	conflicts: Conflict[],
	carts: Cart[],
	nodes: MineNode[],
	edges: MineEdge[]
): { routes: CartRoute[]; conflicts: Conflict[]; resolved: boolean } {
	return domainResolveConflictsWithPriority(routes, conflicts, carts, nodes, edges);
}

function calculateDispatch(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[]
): DispatchResult {
	return domainCalculateDispatch(nodes, edges, carts);
}

function generatePlaybackFrames(
	nodes: MineNode[],
	edges: MineEdge[],
	carts: Cart[],
	dispatchResult: DispatchResult,
	frameInterval: number = 0.5
): PlaybackFrame[] {
	return domainGeneratePlaybackFrames(nodes, edges, carts, dispatchResult, frameInterval);
}

function getDefaultCarts(loadingNodeId: string, unloadingNodeId: string): Cart[] {
	return domainGetDefaultCarts(loadingNodeId, unloadingNodeId);
}

function createNewCart(loadingNodeId: string, unloadingNodeId: string, index: number): Cart {
	return domainCreateNewCart(loadingNodeId, unloadingNodeId, index);
}
