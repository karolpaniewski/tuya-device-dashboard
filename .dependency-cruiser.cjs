/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: "no-circular",
			severity: "warn",
			comment: "Dependency cycles make legacy changes harder to reason about.",
			from: {},
			to: { circular: true },
		},
		{
			name: "no-orphans",
			severity: "info",
			comment: "Modules with no incoming or outgoing deps within scope.",
			from: { orphan: true, pathNot: ["\\.test\\.tsx?$", "\\.d\\.ts$"] },
			to: {},
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		tsPreCompilationDeps: true,
		tsConfig: { fileName: "tsconfig.json" },
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "require", "node", "default", "types"],
		},
		reporterOptions: {
			dot: {
				collapsePattern: "node_modules/[^/]+",
			},
		},
	},
};
