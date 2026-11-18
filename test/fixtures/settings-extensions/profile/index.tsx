import { For } from "solid-js";
import type { Extension } from "../../../../src/module.ts";

const rows = Array.from({ length: 24 }, (_, i) =>
	String(i + 1).padStart(2, "0"),
);

export default {
	modules: [{ id: "badge", render: () => <text>Profile badge</text> }],
	settingsTabs: [
		{
			title: "Profile",
			render: ({ theme }) => (
				<box>
					<input placeholder="profile input" textColor={theme.text} />
					<For each={rows}>
						{(row) => <text fg={theme.text}>{`profile row ${row}`}</text>}
					</For>
				</box>
			),
		},
		{
			title: "Additional preferences",
			render: () => (
				<For each={rows}>{(row) => <text>{`preference row ${row}`}</text>}</For>
			),
		},
		...["Another panel", "Last tab"].map((title) => ({
			title,
			render: () => <text>{`${title} content`}</text>,
		})),
	],
} satisfies Extension;
