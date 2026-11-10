import type { Extension } from "../../../../src/module.ts";
import { note, takeover } from "../../../presence.ts";

export default {
	modules: [
		{
			id: "note",
			render: (context) => {
				context.reportPresence(note);
				return <text>Note</text>;
			},
		},
		{
			id: "takeover",
			render: (context) => {
				context.reportPresence(takeover);
				return <text>Takeover</text>;
			},
		},
	],
} satisfies Extension;
