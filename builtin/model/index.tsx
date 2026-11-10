import type { Extension } from "../../src/module.ts";
import { PickerButton } from "../../src/picker.tsx";

export default {
	modules: [
		{
			id: "current",
			render: (context) => (
				<PickerButton
					context={context}
					id="model-picker"
					label={context.pi.model?.id ?? "no model"}
					width={50}
					items={() =>
						context.pi.models.map((model) => ({
							label: model.id,
							detail: model.provider,
							value: model,
						}))
					}
					selected={() =>
						context.pi.models.findIndex(
							(model) =>
								model.provider === context.pi.model?.provider &&
								model.id === context.pi.model.id,
						)
					}
					onPick={(model) => void context.actions.setModel(model)}
				/>
			),
		},
	],
} satisfies Extension;
