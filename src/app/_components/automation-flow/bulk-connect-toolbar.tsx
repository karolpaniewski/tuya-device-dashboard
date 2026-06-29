"use client";

interface BulkConnectToolbarProps {
	activeModeName: string;
	toConnect: number;
	toDisconnect: number;
	onConnect: () => void;
	onDisconnect: () => void;
	isPending: boolean;
}

export function BulkConnectToolbar({
	activeModeName,
	toConnect,
	toDisconnect,
	onConnect,
	onDisconnect,
	isPending,
}: BulkConnectToolbarProps) {
	if (toConnect === 0 && toDisconnect === 0) return null;

	return (
		<div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
			<span className="max-w-[120px] truncate text-neutral-500 text-xs">
				{activeModeName}
			</span>
			{toConnect > 0 && (
				<button
					className="rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white text-xs disabled:opacity-50"
					disabled={isPending}
					onClick={onConnect}
					type="button"
				>
					Connect {toConnect}
				</button>
			)}
			{toDisconnect > 0 && (
				<button
					className="rounded-lg border border-neutral-300 px-3 py-1.5 font-medium text-neutral-700 text-xs disabled:opacity-50"
					disabled={isPending}
					onClick={onDisconnect}
					type="button"
				>
					Disconnect {toDisconnect}
				</button>
			)}
		</div>
	);
}
