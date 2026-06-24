"use client";

import {
	Cpu,
	Home,
	Image,
	Mail,
	MapPin,
	Palette,
	Thermometer,
	Zap,
} from "lucide-react";
import { useSiteContext } from "~/components/site-context";
import { ErrorMessage } from "~/components/ui/error-message";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { DefaultThresholdsForm } from "./default-thresholds-form";
import { DeviceTable } from "./device-table";
import { DisplaySettings } from "./display-settings";
import { FloorPlanManager } from "./floor-plan-manager";
import { ModeManager } from "./mode-manager";
import { NotificationContactsManager } from "./notification-contacts-manager";
import { RoomManager } from "./room-manager";
import { SettingsCard } from "./settings-card";
import { SiteManager } from "./site-manager";

export function SettingsShell() {
	const { activeSiteId } = useSiteContext();
	const utils = api.useUtils();
	const sitesQuery = api.site.list.useQuery();
	const roomsQuery = api.room.list.useQuery({ siteId: activeSiteId });
	const devicesQuery = api.device.overview.useQuery({ siteId: activeSiteId });

	if (sitesQuery.isLoading || roomsQuery.isLoading || devicesQuery.isLoading) {
		return (
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
					<Skeleton className="h-32 rounded-[20px]" key={i} />
				))}
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

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<SettingsCard
				description="Create, rename, and organize rooms"
				icon={Home}
				title="Rooms"
			>
				<RoomManager
					activeSiteId={activeSiteId}
					rooms={rooms}
					sites={sitesQuery.data ?? []}
					utils={utils}
				/>
			</SettingsCard>

			<SettingsCard
				description="Browse and manage all connected devices"
				icon={Cpu}
				size="wide"
				title="Devices"
			>
				<DeviceTable devices={allDevices} rooms={rooms} utils={utils} />
			</SettingsCard>

			<SettingsCard
				description="Group rooms into named on/off modes, scheduled or manual"
				icon={Zap}
				title="Modes"
			>
				<ModeManager activeSiteId={activeSiteId} rooms={rooms} utils={utils} />
			</SettingsCard>

			<SettingsCard
				description="Create, rename, and remove sites"
				icon={MapPin}
				title="Sites"
			>
				<SiteManager utils={utils} />
			</SettingsCard>

			<SettingsCard
				description="Upload a floor-plan image for the active site"
				icon={Image}
				title="Floor Plan"
			>
				<FloorPlanManager
					activeSiteId={activeSiteId}
					sites={sitesQuery.data ?? []}
					utils={utils}
				/>
			</SettingsCard>

			<SettingsCard
				description="Adjust dashboard card density"
				icon={Palette}
				title="Display / Appearance"
			>
				<DisplaySettings />
			</SettingsCard>

			<SettingsCard
				description="Set the app-wide comfort thresholds"
				icon={Thermometer}
				title="Default Thresholds"
			>
				<DefaultThresholdsForm />
			</SettingsCard>

			<SettingsCard
				description="Email addresses alerted when a room's comfort threshold is violated"
				icon={Mail}
				title="Notification Contacts"
			>
				<NotificationContactsManager utils={utils} />
			</SettingsCard>
		</div>
	);
}
