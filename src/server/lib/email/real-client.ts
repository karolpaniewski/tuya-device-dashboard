import { Resend } from "resend";

import { env } from "~/env";
import { db } from "~/server/db";
import { notificationContacts } from "~/server/db/schema";
import type { AlertViolation, EmailClient } from "./types";

function roomLink(roomId: string): string | null {
	return env.APP_BASE_URL ? `${env.APP_BASE_URL}/#room-${roomId}` : null;
}

function renderText(violations: AlertViolation[]): string {
	return violations
		.map((v) => {
			const link = roomLink(v.roomId);
			const status = `${v.roomName}: ${v.badge}`;
			return link ? `${status} — ${link}` : status;
		})
		.join("\n");
}

function renderHtml(violations: AlertViolation[]): string {
	const items = violations
		.map((v) => {
			const link = roomLink(v.roomId);
			const label = `${v.roomName}: ${v.badge}`;
			return `<li>${link ? `<a href="${link}">${label}</a>` : label}</li>`;
		})
		.join("");
	return `<p>The following rooms have violated their comfort threshold:</p><ul>${items}</ul>`;
}

export const realEmailClient: EmailClient = {
	async sendAlertEmail(params) {
		if (!env.RESEND_API_KEY) {
			throw new Error("RESEND_API_KEY is not configured");
		}
		if (!env.EMAIL_FROM) {
			throw new Error("EMAIL_FROM is not configured");
		}

		const contacts = await db
			.select({ email: notificationContacts.email })
			.from(notificationContacts);

		if (contacts.length === 0) return;

		const resend = new Resend(env.RESEND_API_KEY);
		await resend.emails.send({
			from: env.EMAIL_FROM,
			to: contacts.map((c) => c.email),
			subject: "Comfort threshold alert",
			html: renderHtml(params.violations),
			text: renderText(params.violations),
		});
	},
};
