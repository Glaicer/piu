import type { Extension } from "../../src/module.ts";

export default {
	modules: [
		{
			id: "line",
			render: (context) => {
				const line = () => Object.values(context.pi.statuses).join("  ");
				context.reportPresence(() => (line() ? "shown" : "hidden"));
				return (
					<text wrapMode="none" truncate fg={context.theme.muted}>
						{` ${line()}`}
					</text>
				);
			},
		},
	],
} satisfies Extension;
