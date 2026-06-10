"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";

interface Props {
	error: Error & { digest?: string };
	reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
	const isInternal =
		error.message.includes(" at ") || error.message.length > 200;

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
			<AlertTriangle className="text-destructive" size={48} />
			<h1 className="font-semibold text-white text-xl">Something went wrong</h1>
			{!isInternal && (
				<p className="max-w-md text-gray-400 text-sm">{error.message}</p>
			)}
			<Button onClick={reset}>Try again</Button>
		</div>
	);
}
