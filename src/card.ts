import {
	type BorderCharacters,
	BorderChars,
	type OptimizedBuffer,
	parseColor,
	TextAttributes,
} from "@opentui/core";

export type CardColors = {
	fill: string;
	edge?: string;
	title?: string;
	titleColor?: string;
};

type Box = { screenX: number; screenY: number; width: number; height: number };

// why: painting inside reserved padding keeps the frame from changing Yoga sizes or clipping the Panel's scrollbox and pinned footer.
export function paintCard(colors: () => CardColors) {
	return function (this: Box, buffer: OptimizedBuffer) {
		const { screenX: x, screenY: y, width, height } = this;
		if (width < 2 || height < 2) return;
		const { fill: fillColor, edge: edgeColor, title, titleColor } = colors();
		const fill = parseColor(fillColor);
		if (edgeColor === undefined) {
			buffer.fillRect(x, y, width, height, fill);
			if (title && titleColor)
				buffer.drawTextFit(
					` ${title} `,
					x + 2,
					y + 1,
					width - 3,
					parseColor(titleColor),
					fill,
				);
			return;
		}
		const edge = parseColor(edgeColor);
		const right = x + width - 1;
		const bottom = y + height - 1;
		buffer.fillRect(x + 1, y + 1, width - 2, height - 2, fill);
		const cell = (cx: number, cy: number, char: string) =>
			buffer.setCellWithAlphaBlending(cx, cy, char, edge, fill);
		cell(x, y, "┌");
		cell(right, y, "┐");
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

export type SheetPaint = {
	fill: string;
	rule: string;
	title?: string;
	titleColor?: string;
	hint?: string;
	hintColor?: string;
};

export function sheetHintOffset(width: number, hint: string) {
	return width - 2 - hint.length;
}

// why: a floating surface (a Modal, the `/` list) has no contour, so the heavy line along its top row is what sets it apart from the Panel behind it.
export function paintSheet(paint: () => SheetPaint) {
	return function (this: Box, buffer: OptimizedBuffer) {
		const { screenX: x, screenY: y, width, height } = this;
		if (width < 2 || height < 2) return;
		const {
			fill: fillColor,
			rule,
			title,
			titleColor,
			hint,
			hintColor,
		} = paint();
		const fill = parseColor(fillColor);
		buffer.fillRect(x, y, width, height, fill);
		const ruleColor = parseColor(rule);
		for (let cx = x; cx < x + width; cx++)
			buffer.setCellWithAlphaBlending(cx, y, "━", ruleColor, fill);
		const hintWidth = hint ? hint.length + 1 : 0;
		if (hint && hintColor)
			buffer.drawText(
				hint,
				x + sheetHintOffset(width, hint),
				y + 1,
				parseColor(hintColor),
				fill,
			);
		if (title && titleColor) {
			// why: drawTextFit takes no attributes, so the scissor cuts the bold title instead.
			buffer.pushScissorRect(x + 3, y + 1, width - 5 - hintWidth, 1);
			buffer.drawText(
				` ${title} `,
				x + 3,
				y + 1,
				parseColor(titleColor),
				fill,
				TextAttributes.BOLD,
			);
			buffer.popScissorRect();
		}
	};
}

export type PanelPaint = {
	fill: string;
	rule: string;
	heavyRule: string;
	title?: string;
	titleColor: string;
	joinedAt?: number;
};

// why: Panels have no outer edge; a Panel draws only the line it shares with a neighbour, along its top row when something is above it and its left column when something is to its left. The row a joinAbove Container shares with the Slot above is the heavy line over the input area.
export function paintPanel(paint: () => PanelPaint) {
	return function (this: Box, buffer: OptimizedBuffer) {
		const { screenX: x, screenY: y, width, height } = this;
		if (width < 2 || height < 2) return;
		const {
			fill: fillColor,
			rule,
			heavyRule,
			title,
			titleColor,
			joinedAt,
		} = paint();
		const fill = parseColor(fillColor);
		buffer.fillRect(x, y, width, height, fill);
		if (x > 0) {
			const color = parseColor(rule);
			for (let cy = y; cy < y + height; cy++)
				buffer.setCellWithAlphaBlending(x, cy, "│", color, fill);
		}
		if (y > 0) {
			const heavy = joinedAt === y;
			const color = parseColor(heavy ? heavyRule : rule);
			for (let cx = x; cx < x + width; cx++)
				buffer.setCellWithAlphaBlending(cx, y, heavy ? "━" : "─", color, fill);
		}
		if (title)
			buffer.drawText(
				` ${title} `.slice(0, width - 1),
				x + 1,
				y,
				parseColor(titleColor),
				fill,
				TextAttributes.BOLD,
			);
	};
}

export const barChars: BorderCharacters = BorderChars.single;
