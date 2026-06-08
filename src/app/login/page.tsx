import { loginAction } from "./actions";

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
	const { error, callbackUrl } = await searchParams;

	return (
		<main className="flex min-h-screen items-center justify-center bg-gray-50">
			<div className="w-full max-w-sm rounded-lg bg-white p-8 shadow">
				<h1 className="mb-6 text-2xl font-semibold text-gray-900">
					Tuya Dashboard
				</h1>

				{error === "InvalidCredentials" && (
					<p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
						Nieprawidłowy email lub hasło.
					</p>
				)}

				<form action={loginAction} className="space-y-4">
					<input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />

					<div>
						<label
							htmlFor="email"
							className="mb-1 block text-sm font-medium text-gray-700"
						>
							Email
						</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							autoComplete="email"
							className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
						/>
					</div>

					<div>
						<label
							htmlFor="password"
							className="mb-1 block text-sm font-medium text-gray-700"
						>
							Hasło
						</label>
						<input
							id="password"
							name="password"
							type="password"
							required
							autoComplete="current-password"
							className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
						/>
					</div>

					<button
						type="submit"
						className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none"
					>
						Zaloguj się
					</button>
				</form>
			</div>
		</main>
	);
}
