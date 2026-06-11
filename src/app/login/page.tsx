import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { loginAction } from "./actions";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
	const { error, callbackUrl } = await searchParams;

	return (
		<main className="flex min-h-screen items-center justify-center">
			<div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-8 shadow backdrop-blur-sm">
				<h1 className="mb-6 font-semibold text-2xl text-white">
					Tuya Dashboard
				</h1>

				{error === "InvalidCredentials" && (
					<div className="mb-4">
						<ErrorMessage
							message="Nieprawidłowy email lub hasło."
							variant="banner"
						/>
					</div>
				)}

				<form action={loginAction} className="space-y-4">
					<input name="callbackUrl" type="hidden" value={callbackUrl ?? "/"} />

					<div>
						<label
							className="mb-1 block font-medium text-gray-300 text-sm"
							htmlFor="email"
						>
							Email
						</label>
						<Input
							autoComplete="email"
							id="email"
							name="email"
							required
							type="email"
						/>
					</div>

					<div>
						<label
							className="mb-1 block font-medium text-gray-300 text-sm"
							htmlFor="password"
						>
							Hasło
						</label>
						<Input
							autoComplete="current-password"
							id="password"
							name="password"
							required
							type="password"
						/>
					</div>

					<Button className="w-full" type="submit">
						Zaloguj się
					</Button>
				</form>
			</div>
		</main>
	);
}
