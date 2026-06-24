"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";

interface Props {
	error: Error & { digest?: string };
	reset: () => void;
}

export default function MapError({ reset }: Props) {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
			<AlertTriangle className="text-destructive" size={48} />
			<h1 className="font-semibold text-white text-xl">
				Map View failed to load
			</h1>
			<p className="max-w-md text-gray-400 text-sm">
				Device control is unaffected — use the{" "}
				<Link className="underline" href="/">
					Dashboard list view
				</Link>{" "}
				to control your devices.
			</p>
			<Button onClick={reset}>Try again</Button>
		</div>
	);
}
