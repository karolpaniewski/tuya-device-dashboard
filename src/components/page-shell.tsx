import type { ReactNode } from "react";

interface PageShellProps {
	children: ReactNode;
	rightContent?: ReactNode;
	title: string;
}

export function PageShell({ children, rightContent, title }: PageShellProps) {
	return (
		<main className="min-h-screen bg-gray-950 px-6 py-8 text-white">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="font-bold text-2xl">{title}</h1>
				{rightContent}
			</div>
			{children}
		</main>
	);
}
