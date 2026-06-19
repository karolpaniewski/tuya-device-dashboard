export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { api, HydrateClient } from "~/trpc/server";
import { CommandCenterShell } from "./_components/command-center-shell";
import { DeviceOverview } from "./_components/device-overview";

export default async function Home() {
	const activeSiteId =
		(await cookies()).get("tuya-active-site")?.value ?? "all";
	void api.device.overview.prefetch({ siteId: activeSiteId });

	return (
		<CommandCenterShell>
			<HydrateClient>
				<DeviceOverview />
			</HydrateClient>
		</CommandCenterShell>
	);
}
