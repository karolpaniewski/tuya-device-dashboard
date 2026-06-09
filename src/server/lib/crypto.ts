import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
	const secret = process.env.ENCRYPTION_SECRET;
	if (!secret) throw new Error("ENCRYPTION_SECRET env var is required");
	const key = Buffer.from(secret, "hex");
	if (key.length !== 32)
		throw new Error("ENCRYPTION_SECRET must be 64 hex chars (32 bytes)");
	return key;
}

export function encryptLocalKey(plaintext: string): string {
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptLocalKey(ciphertext: string): string {
	const b = Buffer.from(ciphertext, "base64");
	const decipher = createDecipheriv(ALGORITHM, getKey(), b.subarray(0, IV_LEN));
	decipher.setAuthTag(b.subarray(IV_LEN, IV_LEN + TAG_LEN));
	return Buffer.concat([
		decipher.update(b.subarray(IV_LEN + TAG_LEN)),
		decipher.final(),
	]).toString("utf8");
}
