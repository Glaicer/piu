import {
	type BorderCharacters,
	BorderChars,
	type OptimizedBuffer,
	parseColor,
	RGBA,
} from "@opentui/core";

const clear = RGBA.fromInts(0, 0, 0, 0);

export type CardColors = {
	fill: string;
	edge?: string;
	title?: string;
	titleColor?: string;
};

// why: a box-drawing border is a line through the middle of its cells, so a filled box shows half a cell of fill outside its frame. Half-block glyphs on the outermost cells put the edge of the fill on a cell boundary, so a Card reads as one solid shape with half a cell of margin on every side.
export function paintCard(colors: () => CardColors) {
	return function (
		this: { screenX: number; screenY: number; width: number; height: number },
		buffer: OptimizedBuffer,
	) {
		const { screenX: x, screenY: y, width, height } = this;
		if (width < 2 || height < 2) return;
		const { fill: fillColor, edge: edgeColor, title, titleColor } = colors();
		const fill = parseColor(fillColor);
		const edge = edgeColor ? parseColor(edgeColor) : fill;
		const right = x + width - 1;
		const bottom = y + height - 1;
		buffer.fillRect(x + 1, y + 1, width - 2, height - 2, fill);
		const cell = (cx: number, cy: number, char: string, color = fill) =>
			buffer.setCellWithAlphaBlending(cx, cy, char, color, clear);
		cell(x, y, "▗", edge);
		cell(right, y, "▖");
		cell(x, bottom, "▝", edge);
		cell(right, bottom, "▘");
		for (let cx = x + 1; cx < right; cx++) {
			cell(cx, y, "▄");
			cell(cx, bottom, "▀");
		}
		for (let cy = y + 1; cy < bottom; cy++) {
			cell(x, cy, "▐", edge);
			cell(right, cy, "▌");
		}
		if (title && titleColor)
			buffer.drawText(
				` ${title} `.slice(0, width - 2),
				x + 1,
				y,
				parseColor(titleColor),
				fill,
			);
	};
}

// why: a quarter block sits on the cell's left edge, so a left bar meets its block's fill instead of floating in the middle of a cell.
export const barChars: BorderCharacters = {
	...BorderChars.single,
	vertical: "▎",
};
