import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	test: {
		environment: "node",
		globalSetup: ["./src/test/global-setup.ts"],
		setupFiles: ["./src/test/setup.ts"],
	},
	resolve: {
		alias: {
			"~/": `${path.join(__dirname, "src")}/`,
		},
	},
});
