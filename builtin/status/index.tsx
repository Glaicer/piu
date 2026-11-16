import { TextAttributes } from "@opentui/core";
import type { Extension } from "../../src/module.ts";
import { workingSpinner } from "../../src/spinner.ts";

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
		{
			id: "working",
			render: (context) => {
				const spinner = workingSpinner(context);
				context.reportPresence(() => (context.pi.working ? "shown" : "hidden"));
				return (
					<text
						wrapMode="none"
						fg={context.theme.signal}
						attributes={TextAttributes.BOLD}
					>
						{`${spinner()}working`}
					</text>
				);
			},
		},
	],
} satisfies Extension;
