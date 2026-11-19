import type { BoxRenderable, KeyEvent } from "@opentui/core";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { modalFrameRows } from "../../src/layout.tsx";
import { moduleModal } from "../../src/modal.tsx";
import type { CommandContext } from "../../src/module.ts";
import { scrollIntoView } from "../../src/scroll.ts";
import type { SessionSummary } from "./sessions.ts";

const time = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
});
const date = new Intl.DateTimeFormat("en-GB", {
	day: "2-digit",
	month: "short",
	year: "numeric",
});

export function openResumePicker(
	{ pi, actions, theme }: CommandContext,
	sessions: readonly SessionSummary[],
) {
	const current = pi.sessionFile;
	const today = new Date().toDateString();
	const [index, setIndex] = createSignal(
		Math.max(
			0,
			sessions.findIndex(({ file }) => file === current),
		),
	);
	const [query, setQuery] = createSignal("");
	const filtered = createMemo(() => {
		const words = query().trim().toLowerCase().split(/\s+/);
		return sessions.filter(({ title }) =>
			words.every((word) => title.toLowerCase().includes(word)),
		);
	});
	const pick = (session: SessionSummary) => {
		void actions.switchSession(session.file);
		close();
	};
	const navigate = (event: KeyEvent) => {
		if (event.name === "up" || event.name === "down") {
			const step = event.name === "up" ? -1 : 1;
			setIndex((at) => Math.max(0, Math.min(filtered().length - 1, at + step)));
		} else if (event.name === "return") {
			const session = filtered()[index()];
			if (session) pick(session);
		} else return;
		event.preventDefault();
	};
	const close = actions.openModal(
		moduleModal(
			{
				id: "resume-picker",
				title: "Resume session",
				header: true,
				render: () => (
					<box
						flexDirection="row"
						marginBottom={1}
						backgroundColor={theme.raised}
					>
						<text fg={theme.secondary}>{" /  "}</text>
						<input
							focused
							flexGrow={1}
							backgroundColor={theme.raised}
							focusedBackgroundColor={theme.raised}
							focusedTextColor={theme.text}
							placeholder="Search sessions"
							onInput={(value) => {
								setQuery(value);
								setIndex(0);
							}}
							onKeyDown={navigate}
						/>
					</box>
				),
			},
			{ width: 70, height: Math.min(sessions.length, 16) + modalFrameRows + 3 },
			{
				id: "resume-results",
				render: () => (
					<Show
						when={filtered().length}
						fallback={<text fg={theme.muted}>No matching sessions</text>}
					>
						<For each={filtered()}>
							{(session, at) => {
								const active = () => at() === index();
								const isCurrent = session.file === current;
								const updated =
									session.modified.toDateString() === today
										? `Today ${time.format(session.modified)}`
										: date.format(session.modified);
								let row: BoxRenderable;
								createEffect(() => {
									if (active()) queueMicrotask(() => scrollIntoView(row));
								});
								return (
									<box
										ref={(element: BoxRenderable) => {
											row = element;
										}}
										flexDirection="row"
										height={1}
										paddingX={1}
										gap={1}
										backgroundColor={active() ? theme.bar : theme.surface}
										onMouseDown={(event) => {
											event.preventDefault();
											pick(session);
										}}
									>
										<text width={1} flexShrink={0} fg={theme.secondary}>
											{active() ? "›" : " "}
										</text>
										<text
											fg={active() ? theme.barText : theme.text}
											flexGrow={1}
											flexShrink={1}
											minWidth={0}
											wrapMode="none"
											truncate
										>
											{session.title}
										</text>
										<Show when={isCurrent}>
											<text fg={theme.secondary} flexShrink={0} marginRight={3}>
												current
											</text>
										</Show>
										<text
											width={11}
											fg={active() ? theme.barMuted : theme.muted}
											wrapMode="none"
										>
											{updated}
										</text>
									</box>
								);
							}}
						</For>
					</Show>
				),
			},
			{
				id: "resume-hints",
				footer: true,
				render: () => (
					<text fg={theme.muted} wrapMode="none">
						{"↑↓ select   Enter open   Esc close"}
					</text>
				),
			},
		),
	);
}
