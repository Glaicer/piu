import type { CommandContext, Extension } from "../../src/module.ts";
import type { ModelInfo } from "../../src/pi-state.ts";
import {
	openPicker,
	PickerButton,
	type PickerOptions,
} from "../../src/picker.tsx";

const modelPicker = (context: CommandContext): PickerOptions<ModelInfo> => ({
	id: "model-picker",
	width: 50,
	items: () =>
		context.pi.models.map((model) => ({
			label: model.id,
			detail: model.provider,
			value: model,
		})),
	selected: () =>
		context.pi.models.findIndex(
			(model) =>
				model.provider === context.pi.model?.provider &&
				model.id === context.pi.model.id,
		),
	onPick: (model) => void context.actions.setModel(model),
});

export default {
	modules: [
		{
			id: "current",
			render: (context) => (
				<PickerButton
					context={context}
					label={context.pi.model?.id ?? "no model"}
					picker={modelPicker(context)}
				/>
			),
		},
	],
	commands: [
		{
			name: "model",
			description: "Switch the model",
			run: (context) => openPicker(context, modelPicker(context)),
		},
	],
} satisfies Extension;
