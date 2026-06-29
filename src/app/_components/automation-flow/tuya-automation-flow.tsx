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
	type OnSelectionChangeParams,
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
import { Skeleton } from "~/components/ui/skeleton";
import { computeAutomationFlowLayout } from "~/lib/automation-flow-layout";
import { getModesForRoom } from "~/lib/mode-targeting";
import { api, type RouterOutputs } from "~/trpc/react";
import { RoomModal } from "../room-modal";
import { BulkConnectToolbar } from "./bulk-connect-toolbar";
import { ModeEdge } from "./mode-edge";
import { type ModeFlowNode, ModeNode } from "./mode-node";
import { type RoomFlowNode, RoomNode } from "./room-node";

type AutomationFlowNode = ModeFlowNode | RoomFlowNode;
type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];
type ActiveMode = { modeId: string; modeName: string } | null;

const nodeTypes: NodeTypes = {
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

	const [modalRoomId, setModalRoomId] = useState<string | null>(null);
	const [activeMode, setActiveMode] = useState<ActiveMode>(null);
	const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);

	const devicesByRoomId = useMemo(() => {
		const map = new Map<string, DeviceItem[]>();
		for (const room of overviewQuery.data?.rooms ?? []) {
			map.set(room.roomId, room.devices);
		}
		return map;
	}, [overviewQuery.data]);

	const allModesForCanvas = useMemo(
		() =>
			(modeListQuery.data ?? []).map((mode) => ({
				id: mode.id,
				name: mode.name,
				daysOfWeek: mode.daysOfWeek,
				fireHour: mode.fireHour,
				fireMinute: mode.fireMinute,
				isConnected: mode.targets.length > 0,
				targetOn: null as boolean | null,
			})),
		[modeListQuery.data],
	);

	const layout = useMemo(
		() =>
			computeAutomationFlowLayout(
				allModesForCanvas.length,
				(roomsListQuery.data ?? []).length,
			),
		[allModesForCanvas.length, roomsListQuery.data],
	);

	const computedNodes = useMemo<AutomationFlowNode[]>(() => {
		const modeNodes: ModeFlowNode[] = allModesForCanvas.map((mode, i) => ({
			data: { mode: { ...mode, isActive: mode.id === activeMode?.modeId } },
			id: `mode-${mode.id}`,
			position: layout.modes[i] ?? { x: 0, y: 0 },
			type: "mode" as const,
		}));
		const roomNodes: RoomFlowNode[] = (roomsListQuery.data ?? []).map(
			(room, i) => ({
				data: { roomName: room.name, deviceCount: room.deviceCount },
				id: `room-${room.id}`,
				position: layout.rooms[i] ?? { x: 0, y: 0 },
				type: "room" as const,
			}),
		);
		return [...modeNodes, ...roomNodes];
	}, [allModesForCanvas, roomsListQuery.data, layout, activeMode?.modeId]);

	const [nodes, setNodes, onNodesChange] =
		useNodesState<AutomationFlowNode>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const edgesRef = useRef(edges);
	edgesRef.current = edges;

	const { mutate: addTarget } = api.mode.addTarget.useMutation();
	const { mutate: removeTarget } = api.mode.removeTarget.useMutation();
	const { mutate: addTargets, isPending: isAddingTargets } =
		api.mode.addTargets.useMutation({
			onSuccess: (data) => {
				void utils.mode.list.invalidate();
				if (data.added > 0) {
					toast.success(
						`Connected ${data.added} room${data.added === 1 ? "" : "s"}`,
					);
				}
			},
			onError: () => toast.error("Couldn't connect rooms — try again"),
		});
	const { mutate: removeTargets, isPending: isRemovingTargets } =
		api.mode.removeTargets.useMutation({
			onError: () => toast.error("Couldn't disconnect rooms — try again"),
		});

	const handleDetach = useCallback(
		(modeId: string, roomId: string) => {
			const edgeId = `e-mode-${modeId}-room-${roomId}`;
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
			if (!connection.source?.startsWith("mode-")) return;
			if (!connection.target?.startsWith("room-")) return;

			const modeId = connection.source.slice("mode-".length);
			const roomId = connection.target.slice("room-".length);
			const edgeId = `e-mode-${modeId}-room-${roomId}`;

			if (edgesRef.current.some((e) => e.id === edgeId)) return;

			const modeName =
				allModesForCanvas.find((m) => m.id === modeId)?.name ?? modeId;
			const roomName =
				(roomsListQuery.data ?? []).find((r) => r.id === roomId)?.name ??
				roomId;

			setEdges((current) =>
				addEdge(
					{
						animated: true,
						data: { onDelete: () => handleDetach(modeId, roomId) },
						id: edgeId,
						label: `${modeName} → ${roomName}`,
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
		[
			allModesForCanvas,
			roomsListQuery.data,
			addTarget,
			handleDetach,
			setEdges,
			utils,
		],
	);

	const computedEdges = useMemo<Edge[]>(
		() =>
			(modeListQuery.data ?? []).flatMap((mode) =>
				mode.targets.map((target) => ({
					animated: true,
					data: { onDelete: () => handleDetach(mode.id, target.roomId) },
					id: `e-mode-${mode.id}-room-${target.roomId}`,
					label: `${mode.name} → ${target.roomName}`,
					markerEnd: AUTOMATION_EDGE_MARKER,
					source: `mode-${mode.id}`,
					style: AUTOMATION_EDGE_STYLE,
					target: `room-${target.roomId}`,
					type: "modeEdge",
				})),
			),
		[modeListQuery.data, handleDetach],
	);

	useEffect(() => {
		setNodes((current) => {
			const byId = new Map(current.map((n) => [n.id, n]));
			return computedNodes.map((next) => {
				const existing = byId.get(next.id);
				return existing ? { ...next, position: existing.position } : next;
			});
		});
	}, [computedNodes, setNodes]);

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

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setActiveMode(null);
				setSelectedRoomIds([]);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const onNodeClick = useCallback<NodeMouseHandler<AutomationFlowNode>>(
		(_event, node) => {
			if (node.type === "room") {
				setModalRoomId(node.id.slice("room-".length));
				return;
			}
			if (node.type === "mode") {
				router.push("/setup");
			}
		},
		[router],
	);

	const onNodeDoubleClick = useCallback<NodeMouseHandler<AutomationFlowNode>>(
		(_event, node) => {
			if (node.type !== "mode") return;
			const modeId = node.data.mode.id;
			const modeName = node.data.mode.name;
			setActiveMode((current) =>
				current?.modeId === modeId ? null : { modeId, modeName },
			);
		},
		[],
	);

	const onPaneClick = useCallback(() => {
		setActiveMode(null);
		setSelectedRoomIds([]);
	}, []);

	const onSelectionChange = useCallback(
		({ nodes: selected }: OnSelectionChangeParams) => {
			const rooms = selected
				.filter((n) => n.type === "room")
				.map((n) => n.id.slice("room-".length));
			setSelectedRoomIds(rooms);
		},
		[],
	);

	const activeModeData = useMemo(
		() => modeListQuery.data?.find((m) => m.id === activeMode?.modeId),
		[modeListQuery.data, activeMode?.modeId],
	);

	const connectedRoomIds = useMemo(
		() => new Set((activeModeData?.targets ?? []).map((t) => t.roomId)),
		[activeModeData],
	);

	const toConnect = useMemo(
		() => selectedRoomIds.filter((id) => !connectedRoomIds.has(id)),
		[selectedRoomIds, connectedRoomIds],
	);
	const toDisconnect = useMemo(
		() => selectedRoomIds.filter((id) => connectedRoomIds.has(id)),
		[selectedRoomIds, connectedRoomIds],
	);

	const handleBulkConnect = useCallback(() => {
		if (!activeMode || toConnect.length === 0) return;
		addTargets({ modeId: activeMode.modeId, roomIds: toConnect });
	}, [activeMode, toConnect, addTargets]);

	const handleBulkDisconnect = useCallback(() => {
		if (!activeMode || toDisconnect.length === 0) return;
		const count = toDisconnect.length;
		const ids = [...toDisconnect];
		removeTargets(
			{ modeId: activeMode.modeId, roomIds: ids },
			{
				onSuccess: () => {
					void utils.mode.list.invalidate();
					toast.success(
						`Disconnected ${count} room${count === 1 ? "" : "s"}`,
					);
				},
			},
		);
	}, [activeMode, toDisconnect, removeTargets, utils]);

	if (roomsListQuery.isLoading || modeListQuery.isLoading) {
		return <Skeleton className="h-[560px] w-full rounded-2xl" />;
	}

	if (roomsListQuery.error) {
		return <ErrorMessage message="Failed to load rooms." variant="inline" />;
	}

	if ((roomsListQuery.data ?? []).length === 0) {
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

	const modalRoom = modalRoomId
		? (roomsListQuery.data ?? []).find((r) => r.id === modalRoomId)
		: null;

	return (
		<div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
			{activeMode && (
				<BulkConnectToolbar
					activeModeName={activeMode.modeName}
					isPending={isAddingTargets || isRemovingTargets}
					onConnect={handleBulkConnect}
					onDisconnect={handleBulkDisconnect}
					toConnect={toConnect.length}
					toDisconnect={toDisconnect.length}
				/>
			)}
			<ReactFlow
				deleteKeyCode={null}
				edges={edges}
				edgeTypes={edgeTypes}
				fitView
				fitViewOptions={{ padding: 0.3 }}
				multiSelectionKeyCode="Shift"
				nodes={nodes}
				nodeTypes={nodeTypes}
				onConnect={handleConnect}
				onEdgesChange={onEdgesChange}
				onNodeClick={onNodeClick}
				onNodeDoubleClick={onNodeDoubleClick}
				onNodesChange={onNodesChange}
				onPaneClick={onPaneClick}
				onSelectionChange={onSelectionChange}
				panOnDrag={[1, 2]}
				proOptions={{ hideAttribution: true }}
				selectionOnDrag={true}
			>
				<Background color="#e2e2e2" gap={28} size={1} />
				<Controls showInteractive={false} />
			</ReactFlow>
			{modalRoom && modalRoomId && (
				<RoomModal
					devices={devicesByRoomId.get(modalRoomId) ?? []}
					modesForRoom={getModesForRoom(modalRoomId, modeListQuery.data ?? [])}
					onClose={() => setModalRoomId(null)}
					roomId={modalRoomId}
					roomName={modalRoom.name}
				/>
			)}
		</div>
	);
}

export function TuyaAutomationFlow() {
	return (
		<ReactFlowProvider>
			<TuyaAutomationFlowCanvas />
		</ReactFlowProvider>
	);
}
