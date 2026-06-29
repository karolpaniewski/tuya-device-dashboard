"use client";

import { Flame } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";

export interface HeatToggleProps {
	isPending?: boolean;
	onToggleHeat: (pinnedOff: boolean) => void;
	pinnedOff: boolean;
}

export function HeatToggle({
	isPending,
	onToggleHeat,
	pinnedOff,
}: HeatToggleProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);

	if (pinnedOff) {
		return (
			<Button
				aria-label="Turn heat back on"
				disabled={isPending}
				onClick={() => onToggleHeat(false)}
				size="sm"
				variant="outline"
			>
				<Flame size={14} />
				Turn heat on
			</Button>
		);
	}

	return (
		<Popover onOpenChange={setConfirmOpen} open={confirmOpen}>
			<PopoverTrigger
				render={
					<Button
						aria-label="Turn heat off"
						disabled={isPending}
						size="sm"
						variant="outline"
					>
						<Flame size={14} />
						Turn heat off
					</Button>
				}
			/>
			<PopoverContent>
				<p className="mb-3 text-foreground text-sm">
					Turn off heat in this room?
				</p>
				<div className="flex justify-end gap-2">
					<Button
						onClick={() => setConfirmOpen(false)}
						size="sm"
						variant="ghost"
					>
						Cancel
					</Button>
					<Button
						onClick={() => {
							setConfirmOpen(false);
							onToggleHeat(true);
						}}
						size="sm"
						variant="destructive"
					>
						Confirm
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
