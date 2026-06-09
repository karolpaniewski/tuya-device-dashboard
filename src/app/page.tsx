import { api, HydrateClient } from "~/trpc/server";
import { DeviceOverview } from "./_components/device-overview";

export default async function Home() {
	void api.device.overview.prefetch();

	return (
		<main className="min-h-screen bg-gray-950 px-6 py-8 text-white">
			<h1 className="mb-8 font-bold text-2xl">Tuya Device Dashboard</h1>
			<HydrateClient>
				<DeviceOverview />
			</HydrateClient>
		</main>
	);
}
