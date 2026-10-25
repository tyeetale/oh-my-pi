/**
 * Text selection over the rows of the mutable viewport.
 *
 * Coordinates are viewport-local cells (row 0 is the first mutable-viewport row). A selection
 * covers both the anchor and the head cell, so a drag from column 5 to column 9 selects
 * columns 5 through 9, as terminal selections do. Rows already retired to terminal scrollback
 * are not part of the viewport and cannot be selected here.
 */
import { sliceByColumn, visibleWidth } from "./utils";

export interface SelectionCell {
	row: number;
	col: number;
}

export interface ViewportSelection {
	anchor: SelectionCell;
	head: SelectionCell;
}

/** Selection endpoints in reading order. `end.col` is exclusive. */
export function orderSelection(selection: ViewportSelection): { start: SelectionCell; end: SelectionCell } {
	const { anchor, head } = selection;
	const forward = anchor.row < head.row || (anchor.row === head.row && anchor.col <= head.col);
	const [first, last] = forward ? [anchor, head] : [head, anchor];
	return { start: { row: first.row, col: first.col }, end: { row: last.row, col: last.col + 1 } };
}

/** A press and release inside one cell is a click, not a selection. */
export function isSameCell(a: SelectionCell, b: SelectionCell): boolean {
	return a.row === b.row && a.col === b.col;
}

/** Column span `[from, to)` the selection covers on `row`, or null when the row is outside it. */
function rowSpan(selection: ViewportSelection, row: number, width: number): { from: number; to: number } | null {
	const { start, end } = orderSelection(selection);
	if (row < start.row || row > end.row) return null;
	const from = row === start.row ? Math.min(width, Math.max(0, start.col)) : 0;
	const to = row === end.row ? Math.min(width, Math.max(0, end.col)) : width;
	return to > from ? { from, to } : null;
}

/** The selected text: ANSI stripped, trailing blanks dropped per row, rows joined with newlines. */
export function selectionText(lines: readonly string[], selection: ViewportSelection): string {
	const { start, end } = orderSelection(selection);
	const out: string[] = [];
	const last = Math.min(lines.length - 1, end.row);
	for (let row = Math.max(0, start.row); row <= last; row++) {
		const line = lines[row] ?? "";
		const span = rowSpan(selection, row, visibleWidth(line));
		const text = span === null ? "" : Bun.stripANSI(sliceByColumn(line, span.from, span.to - span.from, true));
		out.push(text.replace(/\s+$/u, ""));
	}
	return out.join("\n").replace(/^\n+|\n+$/gu, "");
}

/**
 * Copy of `lines` with the selected cells in reverse video. Rows the selection does not touch
 * keep their identity, so callers can diff frames by reference.
 */
export function highlightSelection(lines: readonly string[], selection: ViewportSelection): string[] {
	const painted = lines.slice();
	for (let row = 0; row < painted.length; row++) {
		const line = painted[row]!;
		const width = visibleWidth(line);
		const span = rowSpan(selection, row, width);
		if (span === null) continue;
		const before = span.from > 0 ? sliceByColumn(line, 0, span.from, true) : "";
		const middle = sliceByColumn(line, span.from, span.to - span.from, true);
		const after = span.to < width ? sliceByColumn(line, span.to, width - span.to, true) : "";
		painted[row] = `${before}\x1b[7m${middle}\x1b[27m${after}`;
	}
	return painted;
}
