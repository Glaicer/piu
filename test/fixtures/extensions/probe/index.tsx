import type { Extension } from "../../../../src/module.ts";
import { probe } from "../../../probe.ts";

export default {
	modules: [
		{
			id: "capture",
			render: (context) => {
				probe.actions = context.actions;
				context.reportPresence(() => "hidden");
				return <text />;
			},
		},
	],
} satisfies Extension;
