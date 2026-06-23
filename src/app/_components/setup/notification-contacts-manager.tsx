"use client";

import { Mail, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

interface Props {
	utils: ReturnType<typeof api.useUtils>;
}

function errorMessageFor(message: string): string {
	if (message === "DUPLICATE_CONTACT") {
		return "This email is already in the list.";
	}
	return message;
}

export function NotificationContactsManager({ utils }: Props) {
	const contactsQuery = api.notification.list.useQuery();
	const [newEmail, setNewEmail] = useState("");
	const [error, setError] = useState<string | null>(null);

	const invalidate = () => {
		void utils.notification.list.invalidate();
	};

	const createMutation = api.notification.create.useMutation({
		onError: (e) => setError(errorMessageFor(e.message)),
		onSuccess: () => {
			toast.success("Contact added");
			setNewEmail("");
			invalidate();
		},
	});

	const deleteMutation = api.notification.delete.useMutation({
		onError: (e) => setError(errorMessageFor(e.message)),
		onSuccess: () => {
			toast.success("Contact deleted");
			invalidate();
		},
	});

	const contacts = contactsQuery.data ?? [];

	return (
		<section>
			<h2 className="mb-4 font-semibold text-foreground text-lg">
				Notification Contacts
			</h2>
			{error && (
				<div className="mb-3">
					<ErrorMessage message={error} variant="banner" />
				</div>
			)}
			<ul className="flex flex-col gap-2">
				{contacts.map((contact) => (
					<li
						className="flex items-center gap-1.5 rounded-xl border px-4 py-3 sm:gap-3"
						key={contact.id}
						style={{
							background: "var(--cc-glass-bg)",
							borderColor: "var(--cc-glass-border)",
						}}
					>
						<span
							className="flex-1"
							style={{ color: "var(--cc-text-primary)" }}
						>
							{contact.email}
						</span>
						<Button
							disabled={deleteMutation.isPending}
							onClick={() => {
								setError(null);
								deleteMutation.mutate({ id: contact.id });
							}}
							size="sm"
							title="Delete contact"
							type="button"
							variant="destructive"
						>
							<X size={14} />
						</Button>
					</li>
				))}
				{contacts.length === 0 && (
					<li className="flex flex-col items-center justify-center py-16 text-center">
						<Mail className="mb-4 text-gray-600" size={48} />
						<p className="font-semibold text-foreground">No contacts yet</p>
					</li>
				)}
			</ul>

			<form
				className="mt-4 flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const trimmed = newEmail.trim();
					if (trimmed) {
						setError(null);
						createMutation.mutate({ email: trimmed });
					}
				}}
			>
				<Input
					className="flex-1 text-sm"
					onChange={(e) => setNewEmail(e.target.value)}
					placeholder="email@example.com"
					type="email"
					value={newEmail}
				/>
				<Button
					disabled={createMutation.isPending || !newEmail.trim()}
					type="submit"
				>
					{createMutation.isPending ? "Adding…" : "Add"}
				</Button>
			</form>
		</section>
	);
}
