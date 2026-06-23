import { realEmailClient } from "./real-client";
import { stubEmailClient } from "./stub-client";

export type { AlertViolation, EmailClient } from "./types";

export function getEmailClient() {
	return process.env.EMAIL_STUB === "true" ? stubEmailClient : realEmailClient;
}
