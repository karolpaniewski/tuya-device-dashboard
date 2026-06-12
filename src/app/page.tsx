export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import Link from "next/link";
import { PageShell } from "~/components/page-shell";
import { api, HydrateClient } from "~/trpc/server";
import { DeviceOverview } from "./_components/device-overview";

export default async function Home() {
	const activeSiteId =
		(await cookies()).get("tuya-active-site")?.value ?? "all";
	void api.device.overview.prefetch({ siteId: activeSiteId });

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
