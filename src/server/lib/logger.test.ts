import pino from "pino";
import { describe, expect, it } from "vitest";
import {
	getLogger,
	runWithRequestContext,
	runWithWorkerContext,
} from "~/server/lib/log-context";

function loggerWithCollector(level: pino.LevelWithSilent = "info") {
	const lines: string[] = [];
	const stream = { write: (chunk: string) => lines.push(chunk) };
	const testLogger = pino(
		{
			level,
			redact: {
				paths: [
					"*.localKey",
					"*.gateway.localKey",
					"*.passwordHash",
					"*.user.passwordHash",
				],
				censor: "[REDACTED]",
			},
		},
		stream,
	);
	return { logger: testLogger, lines };
}

describe("logger redaction", () => {
	it("never leaks localKey nested one level under a property (e.g. a logged gateway object)", () => {
		const { logger, lines } = loggerWithCollector();
		const secret = "nested-secret-local-key";
		logger.info({ gateway: { localKey: secret } }, "gateway state");
		expect(lines.join("")).not.toContain(secret);
	});

	it("never leaks localKey nested two levels deep under a gateway wrapper", () => {
		const { logger, lines } = loggerWithCollector();
		const secret = "double-nested-secret-local-key";
		logger.info({ event: { gateway: { localKey: secret } } }, "gateway event");
		expect(lines.join("")).not.toContain(secret);
	});

	it("never leaks passwordHash nested one level under a property (e.g. a logged user object)", () => {
		const { logger, lines } = loggerWithCollector();
		const secret = "hashed-password-value";
		logger.info({ user: { passwordHash: secret } }, "auth attempt");
		expect(lines.join("")).not.toContain(secret);
	});

	it("never leaks passwordHash nested two levels deep under a user wrapper", () => {
		const { logger, lines } = loggerWithCollector();
		const secret = "double-nested-password-hash";
		logger.info({ event: { user: { passwordHash: secret } } }, "auth event");
		expect(lines.join("")).not.toContain(secret);
	});
});

describe("log context propagation", () => {
	it("getLogger() outside any scope returns the unbound base logger", () => {
		const log = getLogger();
		expect(log).toBeDefined();
	});

	it("runWithRequestContext attaches a generated requestId", async () => {
		let captured: Record<string, unknown> = {};
		await runWithRequestContext(async () => {
			const log = getLogger();
			captured = log.bindings();
		});
		expect(typeof captured.requestId).toBe("string");
		expect((captured.requestId as string).length).toBeGreaterThan(0);
	});

	it("nested runWithWorkerContext layers fields on top of the request context", async () => {
		let outer: Record<string, unknown> = {};
		let inner: Record<string, unknown> = {};
		await runWithRequestContext(async () => {
			outer = getLogger().bindings();
			await runWithWorkerContext({ gatewayId: "gw-1" }, async () => {
				inner = getLogger().bindings();
			});
		});
		expect(typeof outer.requestId).toBe("string");
		expect(inner.gatewayId).toBe("gw-1");
	});
});

describe("log level filtering", () => {
	it("suppresses debug messages at info level", () => {
		const { logger, lines } = loggerWithCollector("info");
		logger.debug("should not appear");
		expect(lines).toHaveLength(0);
	});

	it("shows debug messages at debug level", () => {
		const { logger, lines } = loggerWithCollector("debug");
		logger.debug("should appear");
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("should appear");
	});
});
