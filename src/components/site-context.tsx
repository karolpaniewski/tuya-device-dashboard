"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "~/trpc/react";

interface SiteContextValue {
	activeSiteId: string;
	sites: { id: string; name: string }[];
	setActiveSite: (id: string) => void;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: React.ReactNode }) {
	const utils = api.useUtils();
	const { data: sites = [] } = api.site.list.useQuery();
	const [activeSiteId, setActiveSiteId] = useState<string>("all");
	const initialized = useRef(false);

	useEffect(() => {
		if (initialized.current || sites.length === 0) return;
		initialized.current = true;

		const cookie = document.cookie
			.split("; ")
			.find((r) => r.startsWith("tuya-active-site="))
			?.split("=")[1];

		if (cookie) {
			setActiveSiteId(cookie);
		} else {
			const first = [...sites].sort((a, b) => a.name.localeCompare(b.name))[0];
			if (first) {
				setActiveSiteId(first.id);
				// biome-ignore lint/suspicious/noDocumentCookie: synchronous cookie write; Cookie Store API is async and not universally available
				document.cookie = `tuya-active-site=${first.id}; path=/`;
			}
		}
	}, [sites]);

	function setActiveSite(id: string) {
		setActiveSiteId(id);
		// biome-ignore lint/suspicious/noDocumentCookie: synchronous cookie write; Cookie Store API is async and not universally available
		document.cookie = `tuya-active-site=${id}; path=/`;
		void utils.device.overview.invalidate();
		void utils.room.list.invalidate();
	}

	return (
		<SiteContext.Provider value={{ activeSiteId, sites, setActiveSite }}>
			{children}
		</SiteContext.Provider>
	);
}

export function useSiteContext() {
	const ctx = useContext(SiteContext);
	if (!ctx) throw new Error("useSiteContext must be used within SiteProvider");
	return ctx;
}
