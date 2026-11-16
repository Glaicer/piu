import {
	type OptimizedBuffer,
	parseColor,
	type Renderable,
	SyntaxStyle,
} from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import type { Theme } from "../../src/theme.ts";

// why: SyntaxStyle falls back from "a.b.c" straight to "a", so the numbered headings and link parts need their own entries.
const headingLevels = [1, 2, 3, 4, 5, 6].map(
	(level) => `markup.heading.${level}`,
);

export function createSyntaxStyle(theme: Theme) {
	const heading = { fg: theme.text, bold: true };
	const link = { fg: theme.secondary, underline: true };
	return SyntaxStyle.fromStyles(
		{
			default: { fg: theme.text },
			"markup.heading": heading,
			...Object.fromEntries(headingLevels.map((name) => [name, heading])),
			"markup.strong": { fg: theme.text, bold: true },
			"markup.italic": { italic: true },
			"markup.strikethrough": { dim: true },
			"markup.raw": { fg: theme.secondary, bg: theme.code, bold: false },
			"markup.list": { fg: theme.signal },
			"markup.quote": { fg: theme.muted, italic: true },
			"markup.link": link,
			"markup.link.label": link,
			"markup.link.url": link,
			conceal: { fg: theme.muted },
			comment: { fg: theme.faint, italic: true },
			keyword: { fg: theme.text, bold: true },
			string: { fg: theme.success },
			number: { fg: theme.warning },
			constant: { fg: theme.warning },
			boolean: { fg: theme.warning },
			type: { fg: theme.tertiary },
			attribute: { fg: theme.tertiary },
			property: { fg: theme.tertiary },
			"variable.member": { fg: theme.tertiary },
			"tag.attribute": { fg: theme.tertiary },
			function: { fg: theme.secondary },
			constructor: { fg: theme.secondary },
			tag: { fg: theme.secondary },
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
			// why: "top-level" keeps finished blocks, so a delta re-highlights only the trailing one; OpenTUI marks it experimental.
			internalBlockMode="top-level"
			renderNode={(token, context) =>
				token.type === "code" ? codeBlock(context.defaultRender()) : undefined
			}
			renderBefore={paintCodeBlocks(() => props.theme.codeBlock)}
			tableOptions={{ style: "grid", borderColor: props.theme.border }}
		/>
	);
}

const codeBlocks = new WeakSet<Renderable>();

// why: a text renderable never runs renderBefore and Markdown resets a code block's `bg` on every in-place update, so Markdown paints the fill under its code blocks; returning the default renderable keeps those in-place updates, which spare finished blocks a re-highlight.
function codeBlock(block: Renderable | null) {
	if (!block) return block;
	block.width = "auto";
	block.marginX = 1;
	codeBlocks.add(block);
	return block;
}

function paintCodeBlocks(fill: () => string) {
	return function (this: Renderable, buffer: OptimizedBuffer) {
		const color = parseColor(fill());
		for (const block of this.getChildren()) {
			if (!codeBlocks.has(block)) continue;
			buffer.fillRect(
				block.screenX - 1,
				block.screenY,
				block.width + 2,
				block.height,
				color,
			);
		}
	};
}
