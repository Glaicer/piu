import { SyntaxStyle } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import type { Theme } from "../../src/theme.ts";

export function createSyntaxStyle(theme: Theme) {
	return SyntaxStyle.fromStyles(
		{
			default: { fg: theme.text },
			"markup.heading": { fg: theme.accent, bold: true },
			"markup.strong": { bold: true },
			"markup.italic": { italic: true },
			"markup.strikethrough": { dim: true },
			"markup.raw": { fg: theme.success },
			"markup.list": { fg: theme.accent },
			"markup.quote": { fg: theme.muted, italic: true },
			"markup.link": { fg: theme.accent, underline: true },
			conceal: { fg: theme.muted },
			comment: { fg: theme.muted, italic: true },
			keyword: { fg: theme.accent, bold: true },
			string: { fg: theme.success },
			number: { fg: theme.warning },
			constant: { fg: theme.warning },
			type: { fg: theme.warning },
			function: { fg: theme.accent },
			operator: { fg: theme.muted },
			punctuation: { fg: theme.muted },
		},
		useRenderer().nativeScene,
	);
}

export function Markdown(props: {
	text: string;
	streaming: boolean;
	syntaxStyle: SyntaxStyle;
	theme: Theme;
}) {
	return (
		<markdown
			content={props.text}
			streaming={props.streaming}
			syntaxStyle={props.syntaxStyle}
			fg={props.theme.text}
			// why: "top-level" keeps each finished block as its own renderable, so a delta re-lexes and re-highlights only the trailing block; the default "coalesced" mode re-highlights every run of prose on each delta. OpenTUI marks this option experimental.
			internalBlockMode="top-level"
			tableOptions={{ style: "grid", borderColor: props.theme.border }}
		/>
	);
}
