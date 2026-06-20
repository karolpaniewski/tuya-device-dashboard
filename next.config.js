/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
	devIndicators: {
		// Dev-only "N" badge defaults to bottom-left, the same corner as the
		// command-center alert toast's design position — move it out of the way.
		position: "top-right",
	},
};

export default config;
