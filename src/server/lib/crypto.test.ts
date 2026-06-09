import { describe, expect, it } from "vitest";
import { decryptLocalKey, encryptLocalKey } from "~/server/lib/crypto";

const PLAINTEXT = "stub-local-key-0000000000000000";

describe("crypto helpers", () => {
	it("roundtrip: decryptLocalKey(encryptLocalKey(x)) === x", () => {
		const ciphertext = encryptLocalKey(PLAINTEXT);
		expect(decryptLocalKey(ciphertext)).toBe(PLAINTEXT);
	});

	it("throws on tampered ciphertext (flipped byte in ciphertext body)", () => {
		const ciphertext = encryptLocalKey(PLAINTEXT);
		const buf = Buffer.from(ciphertext, "base64");
		// Offset 28 is the first ciphertext byte (past 12 IV + 16 auth-tag).
		// XOR flips one bit, breaking GCM auth-tag verification.
		buf[28] = (buf[28] ?? 0) ^ 0xff;
		expect(() => decryptLocalKey(buf.toString("base64"))).toThrow();
	});

	it("throws on an invalid (non-ciphertext) string", () => {
		// Decodes to 4 bytes — far too short for IV + auth-tag; GCM will reject.
		expect(() => decryptLocalKey("dGVzdA==")).toThrow();
	});
});
