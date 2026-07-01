"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

export function ChangePasswordForm() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	const mutation = api.settings.changePassword.useMutation({
		onError: (e) => setFormError(e.message),
		onSuccess: () => {
			toast.success("Password updated");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			setFormError(null);
		},
	});

	return (
		<form
			className="flex flex-col gap-3 rounded-xl border p-3"
			onSubmit={(e) => {
				e.preventDefault();
				if (newPassword !== confirmPassword) {
					setFormError("Passwords do not match");
					return;
				}
				setFormError(null);
				mutation.mutate({ currentPassword, newPassword });
			}}
			style={{
				backgroundColor: "rgba(255, 255, 255, 0.03)",
				borderColor: "rgba(255, 255, 255, 0.06)",
			}}
		>
			<label
				className="flex flex-col gap-1 text-foreground text-sm"
				htmlFor="current-password"
			>
				Current password
				<Input
					autoComplete="current-password"
					id="current-password"
					onChange={(e) => setCurrentPassword(e.target.value)}
					type="password"
					value={currentPassword}
				/>
			</label>
			<label
				className="flex flex-col gap-1 text-foreground text-sm"
				htmlFor="new-password"
			>
				New password
				<Input
					autoComplete="new-password"
					id="new-password"
					onChange={(e) => setNewPassword(e.target.value)}
					type="password"
					value={newPassword}
				/>
			</label>
			<label
				className="flex flex-col gap-1 text-foreground text-sm"
				htmlFor="confirm-password"
			>
				Confirm new password
				<Input
					autoComplete="new-password"
					id="confirm-password"
					onChange={(e) => setConfirmPassword(e.target.value)}
					type="password"
					value={confirmPassword}
				/>
			</label>
			<ErrorMessage message={formError} variant="inline" />
			<div className="flex gap-2">
				<Button disabled={mutation.isPending} type="submit">
					{mutation.isPending ? "Saving…" : "Update Password"}
				</Button>
			</div>
		</form>
	);
}
