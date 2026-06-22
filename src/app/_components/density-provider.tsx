"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

export type Density = "comfortable" | "compact";

const STORAGE_KEY = "cc-density";

interface DensityContextValue {
	density: Density;
	setDensity: (density: Density) => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

export function DensityProvider({ children }: { children: ReactNode }) {
	const [density, setDensityState] = useState<Density>("comfortable");

	useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "comfortable" || stored === "compact") {
			setDensityState(stored);
		}
	}, []);

	function setDensity(next: Density) {
		setDensityState(next);
		localStorage.setItem(STORAGE_KEY, next);
	}

	return (
		<DensityContext.Provider value={{ density, setDensity }}>
			{children}
		</DensityContext.Provider>
	);
}

export function useDensity() {
	const ctx = useContext(DensityContext);
	if (!ctx) {
		throw new Error("useDensity must be used within a DensityProvider");
	}
	return ctx;
}
