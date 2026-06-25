import { TuyaAutomationFlow } from "../_components/automation-flow/tuya-automation-flow";
import { CommandCenterShell } from "../_components/command-center-shell";

export default function AutomationFlowPage() {
	return (
		<CommandCenterShell>
			<div className="flex flex-col gap-4">
				<div>
					<h1 className="font-bold text-foreground text-lg">
						Automation Flow — Living Room
					</h1>
					<p className="text-[var(--s-text-muted)] text-sm">
						Drag devices to rearrange. Click a device to see its details in the
						console.
					</p>
				</div>
				<TuyaAutomationFlow />
			</div>
		</CommandCenterShell>
	);
}
