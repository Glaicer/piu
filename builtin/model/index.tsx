import type { BoxRenderable, InputRenderable, KeyEvent } from "@opentui/core";
import { createEffect, createMemo, createSignal, For } from "solid-js";
import { moduleModal } from "../../src/modal.tsx";
import { sameModel } from "../../src/model.ts";
import type { CommandContext, Extension } from "../../src/module.ts";
import type { ModelInfo } from "../../src/pi-state.ts";
import { PickerLink } from "../../src/picker.tsx";
import { scrollIntoView } from "../../src/scroll.ts";

type ModelTab = "Favorites" | "All";

function ModelPicker(props: { context: CommandContext; close(): void }) {
	const { pi, theme, actions, modelFavorites } = props.context;
	const [tab, setTab] = createSignal<ModelTab>(
		pi.models.some(modelFavorites.has) ? "Favorites" : "All",
	);
	const [query, setQuery] = createSignal("");
	const [index, setIndex] = createSignal(0);
	const models = createMemo(() =>
		pi.models.filter((model) => {
			const needle = query().toLowerCase();
			return (
				(tab() === "All" || modelFavorites.has(model)) &&
				[model.id, model.name, model.provider].some((value) =>
					value.toLowerCase().includes(needle),
				)
			);
		}),
	);
	setIndex(
		Math.max(
			0,
			models().findIndex((model) => sameModel(model, pi.model)),
		),
	);
	let input: InputRenderable;
	let list: BoxRenderable;
	const rows = new Map<ModelInfo, BoxRenderable>();
	const move = (step: number) =>
		setIndex((value) =>
			Math.max(0, Math.min(models().length - 1, value + step)),
		);
	const pick = (model?: ModelInfo) => {
		if (!model) return;
		void actions.setModel(model);
		props.close();
	};
	const updateModels = (change: () => void) => {
		const before = index();
		const selected = models()[before];
		change();
		const next = models();
		const found = selected
			? next.findIndex((model) => sameModel(model, selected))
			: -1;
		setIndex(
			found >= 0 ? found : Math.max(0, Math.min(before, next.length - 1)),
		);
	};
	const changeTab = (next: ModelTab) => updateModels(() => setTab(next));
	const toggle = (model: ModelInfo) =>
		updateModels(() => modelFavorites.toggle(model));
	const onKey = (event: KeyEvent, searching: boolean) => {
		if (event.name === "tab") {
			event.preventDefault();
			(searching ? list : input).focus();
		} else if (event.name === "up" || event.name === "down") {
			event.preventDefault();
			if (searching) list.focus();
			move(event.name === "up" ? -1 : 1);
		} else if (
			!searching &&
			(event.name === "left" || event.name === "right")
		) {
			event.preventDefault();
			changeTab(tab() === "All" ? "Favorites" : "All");
		} else if (!searching && event.name === "f") {
			event.preventDefault();
			const model = models()[index()];
			if (model) toggle(model);
		} else if (event.name === "return") {
			event.preventDefault();
			pick(models()[index()]);
		}
	};
	createEffect(() => {
		const length = models().length;
		if (index() >= length) setIndex(Math.max(0, length - 1));
	});
	createEffect(() => {
		const model = models()[index()];
		// why: a row created by the current filter has no ScrollBox parent until the next render, so scrolling now would see the previous tree.
		queueMicrotask(() => scrollIntoView(model && rows.get(model)));
	});
	return (
		<box flexDirection="column" height={18}>
			<box flexDirection="row">
				<For each={["Favorites", "All"] as const}>
					{(name) => (
						<box
							onMouseDown={(event) => {
								event.preventDefault();
								changeTab(name);
							}}
						>
							<text
								fg={name === tab() ? theme.accent : theme.muted}
							>{` [${name}] `}</text>
						</box>
					)}
				</For>
			</box>
			<box flexDirection="row" onMouseDown={() => input.focus()}>
				<text fg={theme.muted}> Search: </text>
				<input
					ref={(element: InputRenderable) => {
						input = element;
					}}
					focused
					flexGrow={1}
					placeholder="Search models"
					textColor={theme.text}
					onInput={(value: string) => {
						updateModels(() => setQuery(value));
					}}
					onKeyDown={(event) => onKey(event, true)}
				/>
			</box>
			<text fg={theme.muted}> Tab: search/list ←/→: tabs F: favorite</text>
			<scrollbox
				height={15}
				flexShrink={1}
				contentOptions={{ flexDirection: "column" }}
			>
				<box
					ref={(element: BoxRenderable) => {
						list = element;
					}}
					focusable
					onKeyDown={(event) => onKey(event, false)}
					flexDirection="column"
				>
					{models().length === 0 && (
						<text fg={theme.muted}>
							{tab() === "Favorites" && !pi.models.some(modelFavorites.has)
								? " No favorites yet"
								: " No matching models"}
						</text>
					)}
					<For each={models()}>
						{(model, at) => (
							<box
								ref={(element: BoxRenderable) => {
									rows.set(model, element);
								}}
								flexDirection="row"
								backgroundColor={at() === index() ? theme.border : undefined}
								onMouseOver={() => setIndex(at())}
								onMouseDown={(event) => {
									event.preventDefault();
									pick(model);
								}}
							>
								<text
									fg={theme.accent}
									onMouseDown={(event) => {
										event.preventDefault();
										event.stopPropagation();
										toggle(model);
									}}
								>
									{modelFavorites.has(model) ? " ★ " : " ☆ "}
								</text>
								<text
									fg={theme.text}
									width={40}
								>{`${model.id}${sameModel(model, pi.model) ? " *" : ""}${model.name === model.id ? "" : `  ${model.name}`}`}</text>
								<text fg={theme.muted}>{`  ${model.provider}`}</text>
							</box>
						)}
					</For>
				</box>
			</scrollbox>
		</box>
	);
}

function openModelPicker(context: CommandContext) {
	const close = context.actions.openModal(
		moduleModal(
			{
				id: "model-picker",
				render: () => <ModelPicker context={context} close={() => close()} />,
			},
			{ width: 60, height: 20 },
		),
	);
}

export default {
	modules: [
		{
			id: "current",
			render: (context) => (
				<PickerLink
					context={context}
					label={
						context.pi.modelRestoring
							? "loading model..."
							: (context.pi.model?.id ?? "no model")
					}
					onPress={() => openModelPicker(context)}
				/>
			),
		},
	],
	commands: [
		{
			name: "model",
			description: "Switch the model",
			takesArguments: false,
			run: (context) => openModelPicker(context),
		},
	],
} satisfies Extension;
