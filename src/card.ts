import {
	type BorderCharacters,
	BorderChars,
	type OptimizedBuffer,
	parseColor,
} from "@opentui/core";

export type CardColors = {
	fill: string;
	edge: string;
	title?: string;
	titleColor?: string;
	joinedAt?: number;
};

// why: painting inside reserved padding keeps the frame from changing Yoga sizes or clipping the Panel's scrollbox and pinned footer.
export function paintCard(colors: () => CardColors) {
	return function (
		this: { screenX: number; screenY: number; width: number; height: number },
		buffer: OptimizedBuffer,
	) {
		const { screenX: x, screenY: y, width, height } = this;
		if (width < 2 || height < 2) return;
		const {
			fill: fillColor,
			edge: edgeColor,
			title,
			titleColor,
			joinedAt,
		} = colors();
		const fill = parseColor(fillColor);
		const edge = parseColor(edgeColor);
		const right = x + width - 1;
		const bottom = y + height - 1;
		buffer.fillRect(x + 1, y + 1, width - 2, height - 2, fill);
		const cell = (cx: number, cy: number, char: string) =>
			buffer.setCellWithAlphaBlending(cx, cy, char, edge, fill);
		cell(x, y, joinedAt === y ? "├" : "┌");
		cell(right, y, joinedAt === y ? "┤" : "┐");
		cell(x, bottom, "└");
		cell(right, bottom, "┘");
		for (let cx = x + 1; cx < right; cx++) {
			cell(cx, y, "─");
			cell(cx, bottom, "─");
		}
		for (let cy = y + 1; cy < bottom; cy++) {
			cell(x, cy, "│");
			cell(right, cy, "│");
		}
		if (title && titleColor)
			buffer.drawTextFit(
				` ${title} `,
				x + 1,
				y,
				width - 2,
				parseColor(titleColor),
				fill,
			);
	};
}

export const barChars: BorderCharacters = BorderChars.single;
