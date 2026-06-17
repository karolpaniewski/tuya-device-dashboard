import fs from "node:fs";
import path from "node:path";

function todayDateString(): string {
	return new Date().toISOString().slice(0, 10);
}

function logFilePath(dir: string, dateString: string): string {
	return path.join(dir, `app-${dateString}.log`);
}

function cleanupOldFiles(dir: string, retentionDays: number): void {
	const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
	for (const entry of fs.readdirSync(dir)) {
		const match = /^app-(\d{4}-\d{2}-\d{2})\.log$/.exec(entry);
		if (!match) continue;
		const fileDate = new Date(`${match[1]}T00:00:00.000Z`).getTime();
		if (fileDate < cutoff) {
			fs.rmSync(path.join(dir, entry));
		}
	}
}

export function createLogFileDestination(
	dir: string,
	retentionDays: number,
): { write(chunk: string): void } {
	fs.mkdirSync(dir, { recursive: true });

	let currentDateString = todayDateString();
	let fd = fs.openSync(logFilePath(dir, currentDateString), "a");

	return {
		write(chunk: string) {
			const nowDateString = todayDateString();
			if (nowDateString !== currentDateString) {
				fs.closeSync(fd);
				currentDateString = nowDateString;
				fd = fs.openSync(logFilePath(dir, currentDateString), "a");
				cleanupOldFiles(dir, retentionDays);
			}
			fs.writeSync(fd, chunk);
		},
	};
}
