import pino from "pino";
import { createLogFileDestination } from "~/server/lib/log-file-destination";

// Read directly from process.env, not the t3-env `env` object — the validated
// schema for these vars lands in Phase 3 (env wiring); this module must stand
// alone and typecheck before that phase exists.
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const LOG_DIR = process.env.LOG_DIR;
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS ?? 14);

export const redact = {
	paths: [
		"localKey",
		"*.localKey",
		"*.gateway.localKey",
		"passwordHash",
		"*.passwordHash",
		"*.user.passwordHash",
		"*.email",
		"*.contactEmail",
	],
	censor: "[REDACTED]",
};

const stdoutStream: pino.DestinationStream = {
	write: (chunk: string) => process.stdout.write(chunk),
};

const stream = LOG_DIR
	? pino.multistream([
			{ stream: stdoutStream },
			{ stream: createLogFileDestination(LOG_DIR, LOG_RETENTION_DAYS) },
		])
	: stdoutStream;

export const logger = pino(
	{
		level: LOG_LEVEL,
		redact,
	},
	stream,
);
