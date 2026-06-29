export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { api, HydrateClient } from "~/trpc/server";
import { TuyaAutomationFlow } from "../_components/automation-flow/tuya-automation-flow";
import { CommandCenterShell } from "../_components/command-center-shell";

export default async function AutomationFlowPage() {
	const activeSiteId =
		(await cookies()).get("tuya-active-site")?.value ?? "all";
	void api.device.overview.prefetch({ siteId: activeSiteId });
	void api.mode.list.prefetch({ siteId: activeSiteId });
	void api.room.list.prefetch({ siteId: activeSiteId });

	return (
		<CommandCenterShell>
			<HydrateClient>
				<div className="flex flex-col gap-4">
					<div>
						<h1 className="font-bold text-foreground text-lg">
							Automation Flow
						</h1>
						<p className="text-[var(--s-text-muted)] text-sm">
							Drag from a mode's handle to connect it to a room. Double-click a
							mode to activate it, then shift-click rooms to bulk-connect or
							disconnect. Click a room for details.
						</p>
					</div>
					<TuyaAutomationFlow />
				</div>
			</HydrateClient>
		</CommandCenterShell>
	);
}
