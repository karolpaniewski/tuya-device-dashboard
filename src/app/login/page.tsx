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
				<h1 className="mb-6 font-semibold text-2xl text-gray-900">
					Tuya Dashboard
				</h1>

				{error === "InvalidCredentials" && (
					<p className="mb-4 rounded bg-red-50 px-3 py-2 text-red-700 text-sm">
						Nieprawidłowy email lub hasło.
					</p>
				)}

				<form action={loginAction} className="space-y-4">
					<input name="callbackUrl" type="hidden" value={callbackUrl ?? "/"} />

					<div>
						<label
							className="mb-1 block font-medium text-gray-700 text-sm"
							htmlFor="email"
						>
							Email
						</label>
						<input
							autoComplete="email"
							className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
							id="email"
							name="email"
							required
							type="email"
						/>
					</div>

					<div>
						<label
							className="mb-1 block font-medium text-gray-700 text-sm"
							htmlFor="password"
						>
							Hasło
						</label>
						<input
							autoComplete="current-password"
							className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
							id="password"
							name="password"
							required
							type="password"
						/>
					</div>

					<button
						className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 focus:outline-none"
						type="submit"
					>
						Zaloguj się
					</button>
				</form>
			</div>
		</main>
	);
}
