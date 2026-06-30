export const dynamic = "force-dynamic";

import { api, HydrateClient } from "~/trpc/server";
import { CommandCenterShell } from "../_components/command-center-shell";
import { EventFeed } from "./_components/EventFeed";

export default async function EventsPage() {
	void api.event.list.prefetch();

	return (
		<CommandCenterShell>
			<HydrateClient>
				<EventFeed />
			</HydrateClient>
		</CommandCenterShell>
	);
}
