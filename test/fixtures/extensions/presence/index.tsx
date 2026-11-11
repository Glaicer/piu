import type { Extension } from "../../../../src/module.ts";

export default {
	modules: [
		{
			id: "note",
			render: (context) => {
				context.reportPresence(globalThis.piuTestHooks.note);
				return <text>Note</text>;
			},
		},
		{
			id: "takeover",
			render: (context) => {
				context.reportPresence(globalThis.piuTestHooks.takeover);
				return <text>Takeover</text>;
			},
		},
		{
			id: "follower",
			followsOutput: true,
			render: (context) => {
				context.reportPresence(globalThis.piuTestHooks.follower);
				return <text>Follower</text>;
			},
		},
	],
} satisfies Extension;
