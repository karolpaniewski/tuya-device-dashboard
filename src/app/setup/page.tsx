export const dynamic = "force-dynamic";

import Link from "next/link";
import { PageShell } from "~/components/page-shell";
import { api, HydrateClient } from "~/trpc/server";
import { SetupShell } from "../_components/setup/setup-shell";

export default async function SetupPage() {
	void api.room.list.prefetch();
	void api.device.overview.prefetch();

	return (
		<PageShell
			rightContent={
				<Link
					className="text-gray-400 text-sm transition-colors hover:text-white"
					href="/"
				>
					← Dashboard
				</Link>
			}
			title="Room Setup"
		>
			<HydrateClient>
				<SetupShell />
			</HydrateClient>
		</PageShell>
	);
}
