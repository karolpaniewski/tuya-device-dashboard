import { AlertTriangle } from "lucide-react";

interface Props {
	message: string | null | undefined;
	variant?: "banner" | "inline" | "page";
}

export function ErrorMessage({ message, variant = "inline" }: Props) {
	if (!message) return null;

	if (variant === "banner") {
		return (
			<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm">
				{message}
			</div>
		);
	}

	if (variant === "page") {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
				<AlertTriangle className="text-destructive" size={24} />
				<p className="font-semibold text-foreground">Something went wrong</p>
				<p className="text-muted-foreground text-sm">{message}</p>
			</div>
		);
	}

	return <p className="text-destructive text-sm">{message}</p>;
}
