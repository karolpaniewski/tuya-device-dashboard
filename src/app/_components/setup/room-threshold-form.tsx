"use client";

import { useEffect, useState } from "react";
import { api } from "~/trpc/react";

interface Props {
	onClose: () => void;
	roomId: string;
	utils: ReturnType<typeof api.useUtils>;
}

export function RoomThresholdForm({ onClose, roomId, utils }: Props) {
	const { data, isLoading } = api.room.getThreshold.useQuery(
		{ roomId },
		{ refetchOnWindowFocus: false, staleTime: Number.POSITIVE_INFINITY },
	);

	const [formError, setFormError] = useState<string | null>(null);
	const [gap, setGap] = useState("");
	const [max, setMax] = useState("");
	const [min, setMin] = useState("");

	useEffect(() => {
		if (data === undefined) return;
		if (data === null) {
			setMin("18");
			setMax("24");
			setGap("3");
		} else {
			setMin(String(data.minTempC ?? 18));
			setMax(String(data.maxTempC ?? 24));
			setGap(String(data.anomalyGapC ?? 3));
		}
	}, [data]);

	const mutation = api.room.setThreshold.useMutation({
		onError: (e) => setFormError(e.message),
		onSuccess: () => {
			void utils.device.overview.invalidate();
			onClose();
		},
	});

	if (isLoading) {
		return <p className="text-gray-500 text-sm">Loading…</p>;
	}

	return (
		<form
			className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-900 p-3"
			onSubmit={(e) => {
				e.preventDefault();
				const minVal = parseFloat(min);
				const maxVal = parseFloat(max);
				const gapVal = parseFloat(gap);
				if (minVal >= maxVal) {
					setFormError("Min must be less than max");
					return;
				}
				setFormError(null);
				mutation.mutate({
					anomalyGapC: gapVal,
					maxTempC: maxVal,
					minTempC: minVal,
					roomId,
				});
			}}
		>
			<div className="flex flex-wrap items-end gap-4">
				<label className="flex flex-col gap-1 text-sm text-white">
					Min °C
					<input
						className="w-24 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
						onChange={(e) => setMin(e.target.value)}
						step="0.5"
						type="number"
						value={min}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm text-white">
					Max °C
					<input
						className="w-24 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
						onChange={(e) => setMax(e.target.value)}
						step="0.5"
						type="number"
						value={max}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm text-white">
					Anomaly gap °C
					<input
						className="w-24 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
						onChange={(e) => setGap(e.target.value)}
						step="0.5"
						type="number"
						value={gap}
					/>
				</label>
			</div>
			{formError && <p className="text-red-400 text-sm">{formError}</p>}
			<div className="flex gap-2">
				<button
					className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={mutation.isPending}
					type="submit"
				>
					{mutation.isPending ? "Saving…" : "Save"}
				</button>
				<button
					className="rounded border border-gray-600 px-3 py-1.5 text-gray-400 text-sm hover:text-white"
					onClick={onClose}
					type="button"
				>
					Cancel
				</button>
			</div>
		</form>
	);
}
