"use client";

import {
	Background,
	Controls,
	type Edge,
	MarkerType,
	type NodeMouseHandler,
	type NodeTypes,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback } from "react";
import { computeAutomationFlowLayout } from "~/lib/automation-flow-layout";
import { type DeviceFlowNode, DeviceNode } from "./device-node";
import { type ModeFlowNode, ModeNode } from "./mode-node";
import { type RoomFlowNode, RoomNode } from "./room-node";

type AutomationFlowNode = ModeFlowNode | RoomFlowNode | DeviceFlowNode;

const nodeTypes: NodeTypes = {
	device: DeviceNode,
	mode: ModeNode,
	room: RoomNode,
};

// Placeholder mock data, reshaped to the real node contracts (Phase 1) —
// Phase 2 replaces this with device.overview/mode.list-driven data.
const MOCK_LAYOUT = computeAutomationFlowLayout(1, 2);

const initialNodes: AutomationFlowNode[] = [
	{
		data: {
			mode: {
				daysOfWeek: [1, 2, 3, 4, 5],
				fireHour: 18,
				fireMinute: 0,
				id: "mock-mode-1",
				name: "Evening Heat",
				targetOn: true,
			},
		},
		id: "mock-mode-1",
		position: MOCK_LAYOUT.modes[0] ?? { x: 0, y: 0 },
		type: "mode",
	},
	{
		data: { deviceCount: 2, roomName: "Living Room" },
		id: "mock-room",
		position: MOCK_LAYOUT.room,
		type: "room",
	},
	{
		data: {
			device: {
				deviceType: "valve",
				humidityPct: null,
				id: "mock-device-1",
				isOn: null,
				isOnline: true,
				isStale: false,
				lastPolledAt: null,
				mapXPct: null,
				mapYPct: null,
				name: "Radiator Valve",
				nodeId: null,
				roomId: "mock-room",
				roomName: "Living Room",
				setpointC: 21,
				siteId: "mock-site",
				sortOrder: 0,
				temperatureC: 20.5,
				tuyaDeviceId: "mock-tuya-1",
			},
		},
		id: "mock-device-1",
		position: MOCK_LAYOUT.devices[0] ?? { x: 0, y: 0 },
		type: "device",
	},
	{
		data: {
			device: {
				deviceType: "sensor",
				humidityPct: 42,
				id: "mock-device-2",
				isOn: null,
				isOnline: true,
				isStale: false,
				lastPolledAt: null,
				mapXPct: null,
				mapYPct: null,
				name: "Room Sensor",
				nodeId: null,
				roomId: "mock-room",
				roomName: "Living Room",
				setpointC: null,
				siteId: "mock-site",
				sortOrder: 1,
				temperatureC: 20.5,
				tuyaDeviceId: "mock-tuya-2",
			},
		},
		id: "mock-device-2",
		position: MOCK_LAYOUT.devices[1] ?? { x: 0, y: 0 },
		type: "device",
	},
];

const EDGE_STYLE = { stroke: "#a3a3a3", strokeWidth: 1.5 };
const EDGE_LABEL_STYLE = { fill: "#525252", fontSize: 11, fontWeight: 500 };
const EDGE_LABEL_BG_STYLE = { fill: "#ffffff", fillOpacity: 0.92 };
const EDGE_MARKER = {
	color: "#a3a3a3",
	height: 16,
	type: MarkerType.ArrowClosed,
	width: 16,
};

const initialEdges: Edge[] = [
	{
		animated: true,
		id: "e-mode-room",
		label: "Evening Heat → Living Room",
		labelBgBorderRadius: 6,
		labelBgPadding: [6, 3],
		labelBgStyle: EDGE_LABEL_BG_STYLE,
		labelStyle: EDGE_LABEL_STYLE,
		markerEnd: EDGE_MARKER,
		source: "mock-mode-1",
		style: EDGE_STYLE,
		target: "mock-room",
		type: "smoothstep",
	},
	{
		id: "e-room-device-1",
		source: "mock-room",
		target: "mock-device-1",
		type: "smoothstep",
	},
	{
		id: "e-room-device-2",
		source: "mock-room",
		target: "mock-device-2",
		type: "smoothstep",
	},
];

function TuyaAutomationFlowCanvas() {
	const [nodes, , onNodesChange] = useNodesState(initialNodes);
	const [edges, , onEdgesChange] = useEdgesState(initialEdges);

	const onNodeClick = useCallback<NodeMouseHandler<AutomationFlowNode>>(
		(_event, node) => {
			console.info("[TuyaAutomationFlow] node selected:", {
				id: node.id,
				type: node.type,
				...node.data,
			});
		},
		[],
	);

	return (
		<div className="h-[560px] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
			<ReactFlow
				edges={edges}
				fitView
				fitViewOptions={{ padding: 0.3 }}
				nodes={nodes}
				nodeTypes={nodeTypes}
				onEdgesChange={onEdgesChange}
				onNodeClick={onNodeClick}
				onNodesChange={onNodesChange}
				proOptions={{ hideAttribution: true }}
			>
				<Background color="#e2e2e2" gap={28} size={1} />
				<Controls showInteractive={false} />
			</ReactFlow>
		</div>
	);
}

/**
 * Standalone demo: visualizes device relationships/automations for a room
 * as a draggable node-and-edge diagram. Self-contained mock data — no
 * tRPC query, no link to the dashboard's Room modal (which intentionally
 * uses a non-interactive grouped list instead, per the locked PRD scope).
 */
export function TuyaAutomationFlow() {
	return (
		<ReactFlowProvider>
			<TuyaAutomationFlowCanvas />
		</ReactFlowProvider>
	);
}
