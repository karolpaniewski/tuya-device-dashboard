export const dynamic = "force-dynamic";

import Link from "next/link";
import { api, HydrateClient } from "~/trpc/server";
import { SetupShell } from "../_components/setup/setup-shell";

export default async function SetupPage() {
	void api.room.list.prefetch();
	void api.device.overview.prefetch();

	return (
		<main className="min-h-screen bg-gray-950 px-6 py-8 text-white">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="font-bold text-2xl">Room Setup</h1>
				<Link
					className="text-gray-400 text-sm transition-colors hover:text-white"
					href="/"
				>
					← Dashboard
				</Link>
			</div>
			<HydrateClient>
				<SetupShell />
			</HydrateClient>
		</main>
	);
}
