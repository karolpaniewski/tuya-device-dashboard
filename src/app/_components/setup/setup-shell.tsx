"use client";

import { useSiteContext } from "~/components/site-context";
import { ErrorMessage } from "~/components/ui/error-message";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { api } from "~/trpc/react";
import { AutomationManager } from "./automation-manager";
import { DeviceTable } from "./device-table";
import { RoomManager } from "./room-manager";
import { SiteManager } from "./site-manager";

export function SetupShell() {
	const { activeSiteId } = useSiteContext();
	const utils = api.useUtils();
	const sitesQuery = api.site.list.useQuery();
	const roomsQuery = api.room.list.useQuery({ siteId: activeSiteId });
	const devicesQuery = api.device.overview.useQuery({ siteId: activeSiteId });

	if (sitesQuery.isLoading || roomsQuery.isLoading || devicesQuery.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				{Array.from({ length: 4 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
					<Skeleton className="h-12 rounded-lg" key={i} />
				))}
				<Skeleton className="h-32 rounded-lg" />
			</div>
		);
	}

	if (sitesQuery.error ?? roomsQuery.error ?? devicesQuery.error) {
		return <ErrorMessage message="Failed to load data." variant="inline" />;
	}

	const rooms = roomsQuery.data ?? [];
	const allDevices = [
		...(devicesQuery.data?.rooms.flatMap((r) => r.devices) ?? []),
		...(devicesQuery.data?.unassigned ?? []),
	];
	const valveDevices = allDevices.filter((d) => d.deviceType === "valve");

	return (
		<Tabs defaultValue="rooms">
			<TabsList className="mb-6">
				<TabsTrigger value="rooms">Rooms</TabsTrigger>
				<TabsTrigger value="devices">Devices</TabsTrigger>
				<TabsTrigger value="automations">Automations</TabsTrigger>
				<TabsTrigger value="sites">Sites</TabsTrigger>
			</TabsList>

			<TabsContent value="rooms">
				<RoomManager
					activeSiteId={activeSiteId}
					rooms={rooms}
					sites={sitesQuery.data ?? []}
					utils={utils}
				/>
			</TabsContent>

			<TabsContent value="devices">
				<DeviceTable devices={allDevices} rooms={rooms} utils={utils} />
			</TabsContent>

			<TabsContent value="automations">
				<AutomationManager
					activeSiteId={activeSiteId}
					utils={utils}
					valveDevices={valveDevices}
				/>
			</TabsContent>

			<TabsContent value="sites">
				<SiteManager utils={utils} />
			</TabsContent>
		</Tabs>
	);
}
