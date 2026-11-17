import {
	type BoxRenderable,
	type InputRenderable,
	type KeyEvent,
	RenderableEvents,
	TextAttributes,
} from "@opentui/core";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { modalFrameRows } from "../../src/layout.tsx";
import { moduleModal } from "../../src/modal.tsx";
import { sameModel } from "../../src/model.ts";
import type { CommandContext, Extension } from "../../src/module.ts";
import type { ModelInfo } from "../../src/pi-state.ts";
import { PickerLink } from "../../src/picker.tsx";
import { openReasoningPicker } from "../../src/reasoning.ts";
import { scrollIntoView } from "../../src/scroll.ts";
import { Tabs } from "../../src/tabs.tsx";

const tabs = ["Favorites", "All"] as const;
type ModelTab = (typeof tabs)[number];
const WIDTH = 60;

function ModelPicker(props: { context: CommandContext; close(): void }) {
	const { pi, theme, actions, modelFavorites } = props.context;
	const [tab, setTab] = createSignal<ModelTab>(
		pi.models.some(modelFavorites.has) ? "Favorites" : "All",
	);
	const [query, setQuery] = createSignal("");
	const [index, setIndex] = createSignal(0);
	const [searching, setSearching] = createSignal(true);
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
			<Tabs tabs={tabs} active={tab()} theme={theme} onSelect={changeTab} />
			<box flexDirection="row" flexShrink={0} onMouseDown={() => input.focus()}>
				<text
					fg={searching() ? theme.signal : theme.faint}
					attributes={TextAttributes.BOLD}
				>
					{" › "}
				</text>
				<input
					ref={(element: InputRenderable) => {
						input = element;
						setSearching(element.focused);
						element.on(RenderableEvents.FOCUSED, () => setSearching(true));
						element.on(RenderableEvents.BLURRED, () => setSearching(false));
					}}
					focused
					flexGrow={1}
					placeholder="search models"
					textColor={theme.text}
					cursorColor={theme.signal}
					cursorStyle={{ style: "block" }}
					focusedTextColor={theme.text}
					backgroundColor={theme.surface}
					focusedBackgroundColor={theme.surface}
					placeholderColor={theme.faint}
					onInput={(value: string) => {
						updateModels(() => setQuery(value));
					}}
					onKeyDown={(event) => onKey(event, true)}
				/>
			</box>
			<scrollbox
				marginTop={1}
				height={12}
				flexShrink={1}
				contentOptions={{ flexDirection: "column" }}
				scrollbarOptions={{
					trackOptions: {
						foregroundColor: theme.text,
						backgroundColor: theme.surface,
					},
				}}
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
						{(model, at) => {
							const selected = () => at() === index();
							const favorite = () => modelFavorites.has(model);
							return (
								<box
									ref={(element: BoxRenderable) => {
										rows.set(model, element);
									}}
									flexDirection="row"
									paddingRight={1}
									backgroundColor={selected() ? theme.bar : undefined}
									onMouseOver={() => setIndex(at())}
									onMouseDown={(event) => {
										event.preventDefault();
										pick(model);
									}}
								>
									<text
										fg={
											selected()
												? favorite()
													? theme.barText
													: theme.barMuted
												: favorite()
													? theme.text
													: theme.faint
										}
										flexShrink={0}
										onMouseDown={(event) => {
											event.preventDefault();
											event.stopPropagation();
											toggle(model);
										}}
									>
										{favorite() ? " ★ " : " ☆ "}
									</text>
									<text
										fg={selected() ? theme.barText : theme.text}
										attributes={selected() ? TextAttributes.BOLD : undefined}
										flexShrink={1}
										wrapMode="none"
										truncate
									>
										{model.name}
									</text>
									<text
										fg={selected() ? theme.barMuted : theme.faint}
										flexGrow={1}
										flexShrink={0}
										wrapMode="none"
									>
										{sameModel(model, pi.model) ? "  current" : ""}
									</text>
									<text
										fg={selected() ? theme.barMuted : theme.muted}
										flexShrink={0}
										maxWidth="35%"
										wrapMode="none"
										truncate
									>{`  ${model.provider}`}</text>
								</box>
							);
						}}
					</For>
				</box>
			</scrollbox>
			<text
				fg={theme.faint}
				wrapMode="none"
				truncate
				marginTop={1}
				flexShrink={0}
			>
				{" tab search/list   ←/→ tabs   f favorite   ⏎ pick"}
			</text>
		</box>
	);
}

function openModelPicker(context: CommandContext) {
	const close = context.actions.openModal(
		moduleModal(
			{
				id: "model-picker",
				title: "Models",
				render: () => <ModelPicker context={context} close={() => close()} />,
			},
			{ width: WIDTH, height: 18 + modalFrameRows },
		),
	);
}

function modelLabel(context: CommandContext) {
	if (context.pi.modelRestoring) return "loading model...";
	const model = context.pi.model;
	return model ? model.id : "no model";
}

function reasoningLabel(context: CommandContext) {
	const level = context.pi.thinkingLevel;
	return level === "off" ? "no reasoning" : level;
}

export default {
	modules: [
		{
			id: "current",
			footer: true,
			render: (context) => {
				const { theme } = context;
				const muted = () => (context.bar ? theme.barMuted : theme.muted);
				return (
					<box flexDirection="row" flexShrink={0}>
						<PickerLink
							plain
							bold
							color={context.bar ? theme.barText : theme.text}
							context={context}
							label={modelLabel(context)}
							onPress={() => openModelPicker(context)}
						/>
						<Show when={!context.pi.modelRestoring && context.pi.model}>
							<text fg={muted()}> · </text>
							<PickerLink
								plain
								color={muted()}
								context={context}
								label={reasoningLabel(context)}
								onPress={() => openReasoningPicker(context)}
							/>
						</Show>
					</box>
				);
			},
		},
	],
	commands: [
		{
			name: "model",
			description: "Switch the model",
			takesArguments: false,
			run: (context) => openModelPicker(context),
		},
		{
			name: "reasoning",
			description: "Set the reasoning level",
			takesArguments: false,
			run: (context) => openReasoningPicker(context),
		},
	],
} satisfies Extension;
