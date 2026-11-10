import type { Extension } from "../../../../src/module.ts";
import { follower, note, takeover } from "../../../presence.ts";

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
		{
			id: "follower",
			followsOutput: true,
			render: (context) => {
				context.reportPresence(follower);
				return <text>Follower</text>;
			},
		},
	],
} satisfies Extension;
