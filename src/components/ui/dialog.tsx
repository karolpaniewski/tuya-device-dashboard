"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "~/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

function DialogPortal({ children }: { children: React.ReactNode }) {
	return <DialogPrimitive.Portal>{children}</DialogPrimitive.Portal>;
}

function DialogBackdrop({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
	return (
		<DialogPrimitive.Backdrop
			className={cn(
				"fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity",
				"data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
				className,
			)}
			{...props}
		/>
	);
}

function DialogContent({
	className,
	children,
	size = "default",
	layoutId,
	layoutOpen = true,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Popup> & {
	size?: "default" | "wide";
	/**
	 * Opt-in shared-layout morph: when set, the popup grows from (and shrinks
	 * back into) the element carrying the same Framer Motion `layoutId`,
	 * instead of the default centered fade. Every other dialog in the app
	 * omits this prop and keeps today's behavior unchanged.
	 */
	layoutId?: string;
	/** Drives the morph's exit phase; only meaningful when `layoutId` is set. */
	layoutOpen?: boolean;
}) {
	if (layoutId) {
		return (
			<DialogPortal>
				<DialogBackdrop />
				<DialogPrimitive.Popup
					className="fixed inset-0 z-[60] flex items-center justify-center p-4"
					{...props}
				>
					<AnimatePresence>
						{layoutOpen && (
							<motion.div
								className={cn(
									"relative w-full overflow-hidden",
									size === "wide" ? "max-w-4xl" : "max-w-lg",
									"rounded-2xl border border-[var(--s-border-card)] bg-[var(--s-bg-modal)] shadow-2xl",
									className,
								)}
								key={layoutId}
								layoutId={layoutId}
							>
								{children}
							</motion.div>
						)}
					</AnimatePresence>
				</DialogPrimitive.Popup>
			</DialogPortal>
		);
	}

	return (
		<DialogPortal>
			<DialogBackdrop />
			<DialogPrimitive.Popup
				className={cn(
					"fixed top-1/2 left-1/2 z-[60] w-full -translate-x-1/2 -translate-y-1/2",
					size === "wide" ? "max-w-4xl" : "max-w-lg",
					"rounded-2xl border border-[var(--s-border-card)] bg-[var(--s-bg-modal)] shadow-2xl",
					"transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
					className,
				)}
				{...props}
			>
				{children}
			</DialogPrimitive.Popup>
		</DialogPortal>
	);
}

function DialogClose({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
	return (
		<DialogPrimitive.Close
			className={cn(
				"absolute top-4 right-4 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground",
				className,
			)}
			{...props}
		>
			<X size={16} />
		</DialogPrimitive.Close>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"border-[var(--s-border-card)] border-b px-6 py-4 pr-12",
				className,
			)}
			{...props}
		/>
	);
}

function DialogTitle({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			className={cn("font-semibold text-foreground text-lg", className)}
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			className={cn("mt-1 text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("max-h-[70vh] overflow-y-auto px-6 py-4", className)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogBackdrop,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
