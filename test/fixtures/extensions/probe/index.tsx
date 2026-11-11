import type { Extension } from "../../../../src/module.ts";

export default {
	modules: [
		{
			id: "capture",
			render: (context) => {
				globalThis.piuTestHooks.probe.actions = context.actions;
				context.reportPresence(() => "hidden");
				return <text />;
			},
		},
	],
} satisfies Extension;
