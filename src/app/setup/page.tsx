export const dynamic = "force-dynamic";

import { api, HydrateClient } from "~/trpc/server";
import { CommandCenterShell } from "../_components/command-center-shell";
import { SettingsShell } from "../_components/setup/settings-shell";

export default async function SetupPage() {
	void api.room.list.prefetch({ siteId: "all" });
	void api.device.overview.prefetch({ siteId: "all" });

	return (
		<CommandCenterShell>
			<HydrateClient>
				<SettingsShell />
			</HydrateClient>
		</CommandCenterShell>
	);
}
