"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "~/server/auth";

export async function loginAction(formData: FormData) {
	const email = formData.get("email") as string;
	const password = formData.get("password") as string;
	const rawCallbackUrl = (formData.get("callbackUrl") as string) || "/";
	const callbackUrl = rawCallbackUrl.startsWith("/") ? rawCallbackUrl : "/";

	try {
		await signIn("credentials", { email, password, redirect: false });
	} catch (error) {
		if (error instanceof AuthError) {
			redirect("/login?error=InvalidCredentials");
		}
		throw error;
	}

	redirect(callbackUrl);
}
