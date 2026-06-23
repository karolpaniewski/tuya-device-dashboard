export interface AlertViolation {
	roomId: string;
	roomName: string;
	badge: "Too Cold" | "Too Hot";
}

export interface EmailClient {
	sendAlertEmail(params: { violations: AlertViolation[] }): Promise<void>;
}
