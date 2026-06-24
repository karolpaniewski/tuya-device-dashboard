import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function readPreference(): boolean {
	if (typeof window === "undefined") return false;
	return window.matchMedia(QUERY).matches;
}

/** Shared source of truth for the user's reduced-motion preference, live-updating if toggled while the app is open. */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(readPreference);

	useEffect(() => {
		const mediaQuery = window.matchMedia(QUERY);
		const handleChange = () => setReduced(mediaQuery.matches);
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	return reduced;
}
