"use client";

import {
	addEdge,
	Background,
	type Connection,
	Controls,
	type Edge,
	type EdgeTypes,
	MarkerType,
	type NodeMouseHandler,
	type NodeTypes,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSiteContext } from "~/components/site-context";
import { ErrorMessage } from "~/components/ui/error-message";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { computeAutomationFlowLayout } from "~/lib/automation-flow-layout";
import { getAllModesForCanvas, getModesForRoom } from "~/lib/mode-targeting";
import { api, type RouterOutputs } from "~/trpc/react";
import { DeviceModal } from "../device-modal";
import { RoomModal } from "../room-modal";
import { type DeviceFlowNode, DeviceNode } from "./device-node";
import { ModeEdge } from "./mode-edge";
import { type ModeFlowNode, ModeNode } from "./mode-node";
import { type RoomFlowNode, RoomNode } from "./room-node";

type AutomationFlowNode = ModeFlowNode | RoomFlowNode | DeviceFlowNode;
type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

const nodeTypes: NodeTypes = {
	device: DeviceNode,
	mode: ModeNode,
	room: RoomNode,
};

const edgeTypes: EdgeTypes = {
	modeEdge: ModeEdge,
};

const AUTOMATION_EDGE_STYLE = { stroke: "#a3a3a3", strokeWidth: 1.5 };
const AUTOMATION_EDGE_MARKER = {
	color: "#a3a3a3",
	height: 16,
	type: MarkerType.ArrowClosed,
	width: 16,
};
const CONTAINMENT_EDGE_STYLE = { stroke: "#d4d4d4", strokeWidth: 1 };

function TuyaAutomationFlowCanvas() {
	const { activeSiteId } = useSiteContext();
	const router = useRouter();
	const utils = api.useUtils();
	const overviewQuery = api.device.overview.useQuery(
		{ siteId: activeSiteId },
		{ refetchInterval: 30_000, refetchIntervalInBackground: false },
	);
	const modeListQuery = api.mode.list.useQuery({ siteId: activeSiteId });
	const roomsListQuery = api.room.list.useQuery({ siteId: activeSiteId });
	const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
	const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);

	const sortedRooms = useMemo(
		() =>
			[...(overviewQuery.data?.rooms ?? [])].sort((a, b) =>
				a.roomName.localeCompare(b.roomName),
			),
		[overviewQuery.data],
	);

	const [viewedRoomId, setViewedRoomId] = useState<string | null>(null);

	useEffect(() => {
		if (sortedRooms.length === 0) return;
		if (viewedRoomId && sortedRooms.some((r) => r.roomId === viewedRoomId)) {
			return;
		}
		setViewedRoomId(sortedRooms[0]?.roomId ?? null);
	}, [sortedRooms, viewedRoomId]);

	const viewedRoom = sortedRooms.find((r) => r.roomId === viewedRoomId) ?? null;

	const modesForRoom = useMemo(
		() =>
			viewedRoom
				? getModesForRoom(viewedRoom.roomId, modeListQuery.data ?? [])
				: [],
		[viewedRoom, modeListQuery.data],
	);

	const allModesForCanvas = useMemo(
		() => getAllModesForCanvas(viewedRoomId ?? "", modeListQuery.data ?? []),
		[viewedRoomId, modeListQuery.data],
	);

	const layout = useMemo(
		() =>
			computeAutomationFlowLayout(
				allModesForCanvas.length,
				viewedRoom?.devices.length ?? 0,
			),
		[allModesForCanvas.length, viewedRoom?.devices.length],
	);

	const computedNodes = useMemo<AutomationFlowNode[]>(() => {
		if (!viewedRoom) return [];
		const modeNodes: ModeFlowNode[] = allModesForCanvas.map((mode, i) => ({
			data: { mode },
			id: `mode-${mode.id}`,
			position: layout.modes[i] ?? { x: 0, y: 0 },
			type: "mode",
		}));
		const roomNode: RoomFlowNode = {
			data: {
				deviceCount: viewedRoom.devices.length,
				roomName: viewedRoom.roomName,
			},
			id: `room-${viewedRoom.roomId}`,
			position: layout.room,
			type: "room",
		};
		const deviceNodes: DeviceFlowNode[] = viewedRoom.devices.map(
			(device, i) => ({
				data: { device },
				id: `device-${device.id}`,
				position: layout.devices[i] ?? { x: 0, y: 0 },
				type: "device",
			}),
		);
		return [...modeNodes, roomNode, ...deviceNodes];
	}, [viewedRoom, allModesForCanvas, layout]);

	const [nodes, setNodes, onNodesChange] = useNodesState<AutomationFlowNode>(
		[],
	);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const prevRoomIdRef = useRef<string | null>(null);
	const viewedRoomIdRef = useRef(viewedRoomId);
	viewedRoomIdRef.current = viewedRoomId;
	const edgesRef = useRef(edges);
	edgesRef.current = edges;

	const { mutate: addTarget } = api.mode.addTarget.useMutation();
	const { mutate: removeTarget } = api.mode.removeTarget.useMutation();

	const handleDetach = useCallback(
		(modeId: string, roomId: string) => {
			const edgeId = `e-mode-${modeId}-room`;
			const snapshotRoomId = viewedRoomIdRef.current;
			let removedEdge: Edge | undefined;
			setEdges((current) => {
				removedEdge = current.find((e) => e.id === edgeId);
				return removedEdge ? current.filter((e) => e.id !== edgeId) : current;
			});
			removeTarget(
				{ modeId, roomId },
				{
					onSuccess: () => void utils.mode.list.invalidate(),
					onError: () => {
						if (viewedRoomIdRef.current !== snapshotRoomId) return;
						const edge = removedEdge;
						if (edge) setEdges((current) => [...current, edge]);
						toast.error("Couldn't detach room — try again");
					},
				},
			);
		},
		[removeTarget, setEdges, utils],
	);

	const handleConnect = useCallback(
		(connection: Connection) => {
			if (!viewedRoom) return;
			if (!connection.source?.startsWith("mode-")) return;
			if (connection.target !== `room-${viewedRoom.roomId}`) return;

			const modeId = connection.source.slice("mode-".length);
			const roomId = viewedRoom.roomId;
			const edgeId = `e-mode-${modeId}-room`;

			if (edgesRef.current.some((e) => e.id === edgeId)) return;

			const modeName =
				allModesForCanvas.find((m) => m.id === modeId)?.name ?? modeId;

			setEdges((current) =>
				addEdge(
					{
						animated: true,
						data: { onDelete: () => handleDetach(modeId, roomId) },
						id: edgeId,
						label: `${modeName} → ${viewedRoom.roomName}`,
						markerEnd: AUTOMATION_EDGE_MARKER,
						source: connection.source,
						style: AUTOMATION_EDGE_STYLE,
						target: connection.target,
						type: "modeEdge",
					},
					current,
				),
			);

			addTarget(
				{ modeId, roomId },
				{
					onSuccess: () => void utils.mode.list.invalidate(),
					onError: (error) => {
						if (
							"data" in error &&
							(error as { data?: { code?: string } }).data?.code === "CONFLICT"
						)
							return;
						setEdges((current) => current.filter((e) => e.id !== edgeId));
						toast.error("Couldn't connect mode to room — try again");
					},
				},
			);
		},
		[viewedRoom, allModesForCanvas, addTarget, handleDetach, setEdges, utils],
	);

	const computedEdges = useMemo<Edge[]>(() => {
		if (!viewedRoom) return [];
		const modeEdges: Edge[] = modesForRoom.map((mode) => ({
			animated: true,
			data: { onDelete: () => handleDetach(mode.id, viewedRoom.roomId) },
			id: `e-mode-${mode.id}-room`,
			label: `${mode.name} → ${viewedRoom.roomName}`,
			markerEnd: AUTOMATION_EDGE_MARKER,
			source: `mode-${mode.id}`,
			style: AUTOMATION_EDGE_STYLE,
			target: `room-${viewedRoom.roomId}`,
			type: "modeEdge",
		}));
		const deviceEdges: Edge[] = viewedRoom.devices.map((device) => ({
			animated: false,
			id: `e-room-device-${device.id}`,
			source: `room-${viewedRoom.roomId}`,
			style: CONTAINMENT_EDGE_STYLE,
			target: `device-${device.id}`,
			type: "smoothstep",
		}));
		return [...modeEdges, ...deviceEdges];
	}, [viewedRoom, modesForRoom, handleDetach]);

	// Merges freshly computed nodes into existing state on every refetch so an
	// in-progress drag survives the 30s poll — only a room switch fully resets
	// positions, since a previous room's layout has no meaning for a new one.
	useEffect(() => {
		const roomChanged = prevRoomIdRef.current !== viewedRoomId;
		prevRoomIdRef.current = viewedRoomId;

		setNodes((current) => {
			if (roomChanged) return computedNodes;
			const byId = new Map(current.map((n) => [n.id, n]));
			return computedNodes.map((next) => {
				const existing = byId.get(next.id);
				return existing ? { ...next, position: existing.position } : next;
			});
		});
	}, [computedNodes, viewedRoomId, setNodes]);

	useEffect(() => {
		setEdges((current) => {
			const selectedIds = new Set(
				current.filter((e) => e.selected).map((e) => e.id),
			);
			return computedEdges.map((e) =>
				selectedIds.has(e.id) ? { ...e, selected: true } : e,
			);
		});
	}, [computedEdges, setEdges]);

	const onNodeClick = useCallback<NodeMouseHandler<AutomationFlowNode>>(
		(_event, node) => {
			if (node.type === "device") {
				setSelectedDevice(node.data.device);
				return;
			}
			if (node.type === "room") {
				setIsRoomModalOpen(true);
				return;
			}
			if (node.type === "mode") {
				router.push("/setup");
			}
		},
		[router],
	);

	const siteIsAll = activeSiteId === "all";
	const roomItems = Object.fromEntries(
		sortedRooms.map((r) => [
			r.roomId,
			siteIsAll ? `${r.roomName} — ${r.siteName}` : r.roomName,
		]),
	);

	if (overviewQuery.isLoading) {
		return <Skeleton className="h-[608px] w-full rounded-2xl" />;
	}

	if (overviewQuery.error) {
		return <ErrorMessage message="Failed to load devices." variant="inline" />;
	}

	if (sortedRooms.length === 0) {
		return (
			<div className="flex h-[560px] w-full flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-center">
				<Layers className="mb-4 text-neutral-400" size={48} />
				<p className="font-semibold text-neutral-700">
					No rooms with devices yet
				</p>
				<p className="mt-1 max-w-xs text-neutral-500 text-sm">
					Assign a device to a room to see its automation flow here.
				</p>
			</div>
		);
	}

	if (!viewedRoom) return null;

	return (
		<div className="flex flex-col gap-3">
			<Select
				items={roomItems}
				onValueChange={(v) => v && setViewedRoomId(v)}
				value={viewedRoomId ?? ""}
			>
				<SelectTrigger className="w-full sm:w-64">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{sortedRooms.map((room) => (
						<SelectItem key={room.roomId} value={room.roomId}>
							{siteIsAll
								? `${room.roomName} — ${room.siteName}`
								: room.roomName}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<div className="h-[560px] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
				<ReactFlow
					deleteKeyCode={null}
					edges={edges}
					edgeTypes={edgeTypes}
					fitView
					fitViewOptions={{ padding: 0.3 }}
					nodes={nodes}
					nodeTypes={nodeTypes}
					onConnect={handleConnect}
					onEdgesChange={onEdgesChange}
					onNodeClick={onNodeClick}
					onNodesChange={onNodesChange}
					proOptions={{ hideAttribution: true }}
				>
					<Background color="#e2e2e2" gap={28} size={1} />
					<Controls showInteractive={false} />
				</ReactFlow>
			</div>

			{selectedDevice && (
				<DeviceModal
					device={selectedDevice}
					modesForRoom={getModesForRoom(
						selectedDevice.roomId ?? "",
						modeListQuery.data ?? [],
					)}
					onClose={() => setSelectedDevice(null)}
					rooms={roomsListQuery.data ?? []}
					utils={utils}
				/>
			)}
			{isRoomModalOpen && viewedRoom && (
				<RoomModal
					devices={viewedRoom.devices}
					modesForRoom={modesForRoom}
					onClose={() => setIsRoomModalOpen(false)}
					roomId={viewedRoom.roomId}
					roomName={viewedRoom.roomName}
				/>
			)}
		</div>
	);
}

/**
 * Self-contained: reads the active site, fetches device.overview/mode.list
 * itself, and lets the user pick which room to diagram. No mock data —
 * see automation-visibility's mode-targeting.ts for the room-targeting logic
 * this reuses as-is.
 */
export function TuyaAutomationFlow() {
	return (
		<ReactFlowProvider>
			<TuyaAutomationFlowCanvas />
		</ReactFlowProvider>
	);
}
