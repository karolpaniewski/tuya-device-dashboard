import { getLogger } from "~/server/lib/log-context";
import type { EmailClient } from "./types";

export const stubEmailClient: EmailClient = {
	async sendAlertEmail(params) {
		getLogger().info(
			{ roomCount: params.violations.length },
			"email.alert-send-stub",
		);
	},
};
