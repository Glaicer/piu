import { formatTokens } from "../../src/context-usage.ts";
import type { Extension } from "../../src/module.ts";

const CELLS = 10;

export default {
	modules: [
		{
			id: "gauge",
			render: (context) => {
				const { theme } = context;
				context.reportPresence(() =>
					context.pi.contextFill ? "shown" : "hidden",
				);
				const label = () => {
					const fill = context.pi.contextFill;
					if (!fill) return "";
					const filled =
						fill.tokens === null
							? 0
							: Math.min(
									CELLS,
									Math.round((CELLS * fill.tokens) / fill.window),
								);
					const used = fill.tokens === null ? "?" : formatTokens(fill.tokens);
					return `${"▰".repeat(filled)}${"▱".repeat(CELLS - filled)}  ${used}/${formatTokens(fill.window)}`;
				};
				return (
					<text wrapMode="none" fg={context.bar ? theme.barMuted : theme.muted}>
						{label()}
					</text>
				);
			},
		},
	],
} satisfies Extension;
