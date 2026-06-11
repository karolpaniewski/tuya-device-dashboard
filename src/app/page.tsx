export const dynamic = "force-dynamic";

import Link from "next/link";
import { PageShell } from "~/components/page-shell";
import { api, HydrateClient } from "~/trpc/server";
import { DeviceOverview } from "./_components/device-overview";

export default async function Home() {
	void api.device.overview.prefetch();

	return (
		<PageShell
			rightContent={
				<Link
					className="text-gray-400 text-sm transition-colors hover:text-white"
					href="/setup"
				>
					Setup →
				</Link>
			}
			title="Tuya Device Dashboard"
		>
			<HydrateClient>
				<DeviceOverview />
			</HydrateClient>
		</PageShell>
	);
}
