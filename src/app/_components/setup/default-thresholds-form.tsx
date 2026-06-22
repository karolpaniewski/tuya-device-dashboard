"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

export function DefaultThresholdsForm() {
	const utils = api.useUtils();
	const { data, isLoading } = api.settings.getDefaultThresholds.useQuery(
		undefined,
		{ refetchOnWindowFocus: false, staleTime: Number.POSITIVE_INFINITY },
	);

	const [formError, setFormError] = useState<string | null>(null);
	const [gap, setGap] = useState("");
	const [max, setMax] = useState("");
	const [min, setMin] = useState("");

	useEffect(() => {
		if (data === undefined) return;
		setMin(String(data.minTempC));
		setMax(String(data.maxTempC));
		setGap(String(data.anomalyGapC));
	}, [data]);

	const mutation = api.settings.setDefaultThresholds.useMutation({
		onError: (e) => setFormError(e.message),
		onSuccess: () => {
			toast.success("Default thresholds saved");
			void utils.settings.getDefaultThresholds.invalidate();
		},
	});

	if (isLoading) {
		return (
			<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
				<Skeleton className="h-9 w-full rounded-md sm:w-24" />
				<Skeleton className="h-9 w-full rounded-md sm:w-24" />
				<Skeleton className="h-9 w-full rounded-md sm:w-24" />
				<Skeleton className="h-9 w-full rounded-md sm:w-20" />
			</div>
		);
	}

	return (
		<form
			className="flex flex-col gap-3 rounded-xl border p-3"
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
				});
			}}
			style={{
				backgroundColor: "rgba(255, 255, 255, 0.03)",
				borderColor: "rgba(255, 255, 255, 0.06)",
			}}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
				<label
					className="flex flex-col gap-1 text-foreground text-sm"
					htmlFor="default-threshold-min"
				>
					Min °C
					<Input
						className="w-full sm:w-24"
						id="default-threshold-min"
						onChange={(e) => setMin(e.target.value)}
						step="0.5"
						type="number"
						value={min}
					/>
				</label>
				<label
					className="flex flex-col gap-1 text-foreground text-sm"
					htmlFor="default-threshold-max"
				>
					Max °C
					<Input
						className="w-full sm:w-24"
						id="default-threshold-max"
						onChange={(e) => setMax(e.target.value)}
						step="0.5"
						type="number"
						value={max}
					/>
				</label>
				<label
					className="flex flex-col gap-1 text-foreground text-sm"
					htmlFor="default-threshold-gap"
				>
					Anomaly gap °C
					<Input
						className="w-full sm:w-24"
						id="default-threshold-gap"
						onChange={(e) => setGap(e.target.value)}
						step="0.5"
						type="number"
						value={gap}
					/>
				</label>
			</div>
			<ErrorMessage message={formError} variant="inline" />
			<div className="flex gap-2">
				<Button disabled={mutation.isPending} type="submit">
					{mutation.isPending ? "Saving…" : "Save"}
				</Button>
			</div>
		</form>
	);
}
