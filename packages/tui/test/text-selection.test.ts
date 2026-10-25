import { beforeAll, describe, expect, it } from "bun:test";
import { type Component } from "@oh-my-pi/pi-tui";
import { TranscriptContainer } from "@oh-my-pi/pi-tui/chrome/transcript-container";
import { COMPOSER_DEFAULTS, Composer } from "@oh-my-pi/pi-tui/prompt/composer";
import { highlightSelection, isSameCell, orderSelection, selectionText } from "@oh-my-pi/pi-tui/text-selection";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { VirtualTerminal } from "./virtual-terminal";

const at = (row: number, col: number) => ({ row, col });

describe("orderSelection", () => {
	it("puts a backwards drag in reading order and includes the head cell", () => {
		const forward = orderSelection({ anchor: at(1, 2), head: at(3, 5) });
		const backward = orderSelection({ anchor: at(3, 5), head: at(1, 2) });
		expect(backward).toEqual(forward);
		expect(forward).toEqual({ start: at(1, 2), end: at(3, 6) });
	});

	it("orders cells on one row by column", () => {
		expect(orderSelection({ anchor: at(2, 9), head: at(2, 4) })).toEqual({ start: at(2, 4), end: at(2, 10) });
	});

	it("tells a click from a move by cell identity", () => {
		expect(isSameCell(at(1, 1), at(1, 1))).toBe(true);
		expect(isSameCell(at(1, 1), at(1, 2))).toBe(false);
	});
});

describe("selectionText", () => {
	const lines = ["alpha beta   ", "gamma", "", "delta epsilon"];

	it("reads a span inside one row, both end cells included", () => {
		expect(selectionText(lines, { anchor: at(0, 6), head: at(0, 9) })).toBe("beta");
	});

	it("reads whole middle rows and the partial first and last rows, dropping trailing blanks", () => {
		expect(selectionText(lines, { anchor: at(0, 6), head: at(3, 4) })).toBe("beta\ngamma\n\ndelta");
	});

	it("gives the same text for a drag made backwards", () => {
		const forward = selectionText(lines, { anchor: at(0, 6), head: at(3, 4) });
		expect(selectionText(lines, { anchor: at(3, 4), head: at(0, 6) })).toBe(forward);
	});

	it("strips styling from the copied text", () => {
		const styled = ["\x1b[31mred \x1b[1mbold\x1b[0m plain"];
		expect(selectionText(styled, { anchor: at(0, 0), head: at(0, 7) })).toBe("red bold");
	});

	it("selects wide characters by cell without splitting them", () => {
		expect(selectionText(["日本語 abc"], { anchor: at(0, 2), head: at(0, 5) })).toBe("本語");
	});

	it("clamps a selection that runs past the rows it was made on", () => {
		expect(selectionText(["one", "two"], { anchor: at(1, 0), head: at(9, 99) })).toBe("two");
		expect(selectionText(["one", "two"], { anchor: at(0, 1), head: at(0, 99) })).toBe("ne");
	});

	it("returns nothing for rows that hold only blanks", () => {
		expect(selectionText(["   ", ""], { anchor: at(0, 0), head: at(1, 5) })).toBe("");
	});
});

describe("highlightSelection", () => {
	it("reverse-videos only the selected cells and keeps the visible text identical", () => {
		const out = highlightSelection(["alpha beta"], { anchor: at(0, 6), head: at(0, 9) });
		expect(Bun.stripANSI(out[0]!)).toBe("alpha beta");
		expect(out[0]!).toContain("\x1b[7mbeta\x1b[27m");
	});

	it("keeps the styling of the text around and inside the selection", () => {
		const out = highlightSelection(["\x1b[31mred \x1b[1mbold\x1b[0m plain"], { anchor: at(0, 4), head: at(0, 7) });
		expect(Bun.stripANSI(out[0]!)).toBe("red bold plain");
		// The tail after the selection is still red: styling is re-opened, not dropped.
		expect(out[0]!.slice(out[0]!.indexOf("\x1b[27m"))).toContain("\x1b[31m");
	});

	it("leaves rows outside the selection untouched and does not mutate its input", () => {
		const input = ["one", "two", "three"];
		const snapshot = [...input];
		const out = highlightSelection(input, { anchor: at(1, 0), head: at(1, 1) });
		expect(input).toEqual(snapshot);
		expect(out[0]).toBe(input[0]!);
		expect(out[2]).toBe(input[2]!);
		expect(out[1]).not.toBe(input[1]!);
	});
});

class Rows implements Component {
	constructor(public rows: readonly string[]) {}
	isTranscriptBlockFinalized(): boolean {
		return false;
	}
	render(): readonly string[] {
		return this.rows;
	}
}

describe("Composer viewport selection", () => {
	beforeAll(() => {
		initTheme();
	});

	function mount() {
		const term = new VirtualTerminal(80, 24);
		const composer = new Composer({ terminal: term, preferences: { ...COMPOSER_DEFAULTS, quiet: true } });
		composer.start();
		const transcript = new TranscriptContainer();
		transcript.addChild(new Rows(["first row of output", "second row of output"]));
		composer.setRuntimeChildren([transcript]);
		return { composer, term };
	}

	it("paints the selection on the frame it returns and reads the text from the unpainted rows", () => {
		const { composer } = mount();
		try {
			const plain = composer.renderFrame({ columns: 80, rows: 24 }).viewport;
			const row = plain.findIndex(line => line.includes("second row of output"));
			expect(row).toBeGreaterThanOrEqual(0);

			composer.setViewportSelection({ anchor: at(row, 0), head: at(row, 5) });
			const painted = composer.renderFrame({ columns: 80, rows: 24 }).viewport;
			expect(painted[row]).toContain("\x1b[7m");
			expect(Bun.stripANSI(painted[row]!)).toBe(Bun.stripANSI(plain[row]!));
			expect(composer.hasViewportSelection()).toBe(true);
			expect(composer.viewportSelectionText()).toBe("second");
		} finally {
			composer.stop();
		}
	});

	it("keeps a pinned selection while its rows are unchanged and drops it when they shift", () => {
		const term = new VirtualTerminal(80, 24);
		const composer = new Composer({ terminal: term, preferences: { ...COMPOSER_DEFAULTS, quiet: true } });
		composer.start();
		try {
			const transcript = new TranscriptContainer();
			const block = new Rows(["first row of output", "second row of output"]);
			transcript.addChild(block);
			composer.setRuntimeChildren([transcript]);
			const plain = composer.renderFrame({ columns: 80, rows: 24 }).viewport;
			const row = plain.findIndex(line => line.includes("second row of output"));

			composer.setViewportSelection({ anchor: at(row, 0), head: at(row, 5) });
			composer.renderFrame({ columns: 80, rows: 24 });
			composer.pinViewportSelection();
			// Same rows again: the highlight stays.
			composer.renderFrame({ columns: 80, rows: 24 });
			expect(composer.hasViewportSelection()).toBe(true);

			// A row appears above the selection, pushing its text down: the highlight would now cover other text.
			block.rows = ["a new row of output", "first row of output", "second row of output"];
			const shifted = composer.renderFrame({ columns: 80, rows: 24 }).viewport;
			expect(composer.hasViewportSelection()).toBe(false);
			expect(shifted.join("\n")).not.toContain("\x1b[7m");
		} finally {
			composer.stop();
		}
	});

	it("returns to the exact unpainted rows once the selection is cleared", () => {
		const { composer } = mount();
		try {
			const plain = composer.renderFrame({ columns: 80, rows: 24 }).viewport;
			composer.setViewportSelection({ anchor: at(0, 0), head: at(2, 3) });
			composer.renderFrame({ columns: 80, rows: 24 });
			composer.setViewportSelection(undefined);
			expect(composer.renderFrame({ columns: 80, rows: 24 }).viewport).toEqual(plain);
			expect(composer.hasViewportSelection()).toBe(false);
			expect(composer.viewportSelectionText()).toBe("");
		} finally {
			composer.stop();
		}
	});
});
