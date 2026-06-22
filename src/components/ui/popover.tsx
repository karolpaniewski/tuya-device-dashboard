"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "~/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverPortal({ children }: { children: React.ReactNode }) {
	return <PopoverPrimitive.Portal>{children}</PopoverPrimitive.Portal>;
}

function PopoverPositioner({
	className,
	sideOffset = 8,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Positioner>) {
	return (
		<PopoverPrimitive.Positioner
			className={cn("z-50 outline-none", className)}
			sideOffset={sideOffset}
			{...props}
		/>
	);
}

function PopoverContent({
	className,
	children,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup>) {
	return (
		<PopoverPortal>
			<PopoverPositioner>
				<PopoverPrimitive.Popup
					className={cn(
						"w-64 rounded-xl border border-[var(--s-border-card)] bg-[var(--s-bg-card)] p-3 shadow-2xl",
						"transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
						className,
					)}
					{...props}
				>
					{children}
				</PopoverPrimitive.Popup>
			</PopoverPositioner>
		</PopoverPortal>
	);
}

export {
	Popover,
	PopoverContent,
	PopoverPortal,
	PopoverPositioner,
	PopoverTrigger,
};
