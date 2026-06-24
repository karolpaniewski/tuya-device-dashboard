export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { api, HydrateClient } from "~/trpc/server";
import { CommandCenterShell } from "../_components/command-center-shell";
import { MapView } from "../_components/map/map-view";

export default async function MapPage() {
	const activeSiteId =
		(await cookies()).get("tuya-active-site")?.value ?? "all";
	void api.device.overview.prefetch({ siteId: activeSiteId });
	void api.site.list.prefetch();
	void api.room.list.prefetch({ siteId: activeSiteId });

	return (
		<CommandCenterShell>
			<HydrateClient>
				<MapView />
			</HydrateClient>
		</CommandCenterShell>
	);
}
