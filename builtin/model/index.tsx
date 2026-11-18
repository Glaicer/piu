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
import { thinkingLevels } from "../../src/model-selection.ts";
import type { CommandContext, Extension } from "../../src/module.ts";
import type { ModelInfo, ThinkingLevel } from "../../src/pi-state.ts";
import { PickerLink } from "../../src/picker.tsx";
import { openReasoningPicker } from "../../src/reasoning.ts";
import { scrollIntoView } from "../../src/scroll.ts";
import { Tabs } from "../../src/tabs.tsx";

const tabs = ["Favorites", "All"] as const;
type ModelTab = (typeof tabs)[number];
type PickerFocus = "search" | "list" | "effort";
const WIDTH = 72;
const HEIGHT = 18;

function shortLevel(level: ThinkingLevel) {
	return level === "minimal" ? "min" : level === "medium" ? "med" : level;
}

function ModelPicker(props: { context: CommandContext; close(): void }) {
	const { pi, theme, actions, modelFavorites } = props.context;
	const [tab, setTab] = createSignal<ModelTab>(
		pi.models.some(modelFavorites.has) ? "Favorites" : "All",
	);
	const [query, setQuery] = createSignal("");
	const [index, setIndex] = createSignal(0);
	const [searching, setSearching] = createSignal(true);
	const [adjusting, setAdjusting] = createSignal(false);
	const [drafts, setDrafts] = createSignal(new Map<ModelInfo, ThinkingLevel>());
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
	const selectedModel = () => models()[index()];
	const choices = createMemo(() => {
		const model = selectedModel();
		return sameModel(model, pi.model)
			? pi.thinkingLevels
			: (model?.thinkingLevels ?? []);
	});
	const canAdjust = () => choices().length > 1;
	const effort = () => {
		const model = selectedModel();
		const draft = model && drafts().get(model);
		if (draft && choices().includes(draft)) return draft;
		const current = thinkingLevels.indexOf(pi.thinkingLevel);
		return (
			choices().findLast((level) => thinkingLevels.indexOf(level) <= current) ??
			choices()[0]
		);
	};
	const selectLevel = (level: ThinkingLevel) => {
		const model = selectedModel();
		if (model) setDrafts((previous) => new Map(previous).set(model, level));
	};
	setIndex(
		Math.max(
			0,
			models().findIndex((model) => sameModel(model, pi.model)),
		),
	);
	let input: InputRenderable;
	let list: BoxRenderable;
	let slider: BoxRenderable;
	const rows = new Map<ModelInfo, BoxRenderable>();
	const move = (step: number) =>
		setIndex((value) =>
			Math.max(0, Math.min(models().length - 1, value + step)),
		);
	const pick = () => {
		const model = selectedModel();
		if (!model) return;
		void actions.setModel(model, canAdjust() ? effort() : undefined);
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
	const onKey = (event: KeyEvent, focus: PickerFocus) => {
		if (event.name === "tab") {
			event.preventDefault();
			const stops = canAdjust() ? [input, list, slider] : [input, list];
			const at = stops.indexOf(
				focus === "search" ? input : focus === "list" ? list : slider,
			);
			stops[
				(at + (event.shift ? -1 : 1) + stops.length) % stops.length
			]?.focus();
		} else if (event.name === "up" || event.name === "down") {
			event.preventDefault();
			list.focus();
			move(event.name === "up" ? -1 : 1);
		} else if (event.name === "left" || event.name === "right") {
			event.preventDefault();
			if (focus === "effort") {
				const current = effort();
				if (!current) return;
				const next =
					choices()[
						choices().indexOf(current) + (event.name === "left" ? -1 : 1)
					];
				if (next) selectLevel(next);
			} else changeTab(tab() === "All" ? "Favorites" : "All");
		} else if (focus === "list" && event.name === "f") {
			event.preventDefault();
			const model = selectedModel();
			if (model) toggle(model);
		} else if (event.name === "return") {
			event.preventDefault();
			pick();
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
	createEffect(() => {
		if (adjusting() && !canAdjust()) list.focus();
	});
	return (
		<box flexDirection="column" height={HEIGHT}>
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
					onKeyDown={(event) => onKey(event, "search")}
				/>
			</box>
			<scrollbox
				marginTop={1}
				height={8}
				flexShrink={1}
				contentOptions={{ flexDirection: "column", paddingRight: 1 }}
				verticalScrollbarOptions={{
					position: "absolute",
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
					onKeyDown={(event) => onKey(event, "list")}
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
									onMouseDown={(event) => {
										event.preventDefault();
										setIndex(at());
										list.focus();
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
			<box
				ref={(element: BoxRenderable) => {
					slider = element;
					element.on(RenderableEvents.FOCUSED, () => setAdjusting(true));
					element.on(RenderableEvents.BLURRED, () => setAdjusting(false));
				}}
				focusable
				onKeyDown={(event) => onKey(event, "effort")}
				flexDirection="column"
				marginTop={1}
				height={3}
				flexShrink={0}
				paddingLeft={1}
			>
				<text
					fg={adjusting() ? theme.signal : theme.muted}
					wrapMode="none"
					truncate
				>
					{`${adjusting() ? "›" : " "} Reasoning effort`}
				</text>
				<Show
					when={canAdjust()}
					fallback={
						<text fg={theme.faint} wrapMode="none" truncate>
							{!selectedModel()
								? "  No model selected"
								: !effort() || effort() === "off"
									? "  Not supported by this model"
									: `  Fixed: ${effort()}`}
						</text>
					}
				>
					<box flexDirection="row" paddingLeft={2} overflow="hidden">
						<For each={choices()}>
							{(level, at) => (
								<box
									flexDirection="column"
									width={7}
									flexShrink={0}
									onMouseDown={(event) => {
										event.preventDefault();
										selectLevel(level);
										slider.focus();
									}}
								>
									<text
										fg={level === effort() ? theme.signal : theme.muted}
										wrapMode="none"
									>
										{`${level === effort() ? "[x]" : "[ ]"}${at() < choices().length - 1 ? "────" : ""}`}
									</text>
									<text
										fg={level === effort() ? theme.text : theme.muted}
										wrapMode="none"
									>
										{shortLevel(level)}
									</text>
								</box>
							)}
						</For>
					</box>
				</Show>
			</box>
			<box flexDirection="row" marginTop={1} flexShrink={0}>
				<text fg={theme.faint} wrapMode="none" truncate flexShrink={1}>
					{` tab search/list${canAdjust() ? "/effort" : ""}   ${adjusting() ? "←/→ effort" : "←/→ tabs   f favorite"}   `}
				</text>
				<text
					fg={selectedModel() ? theme.text : theme.faint}
					wrapMode="none"
					flexShrink={0}
					onMouseDown={(event) => {
						event.preventDefault();
						pick();
					}}
				>
					{"⏎ apply"}
				</text>
			</box>
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
			{ width: WIDTH, height: HEIGHT + modalFrameRows },
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
