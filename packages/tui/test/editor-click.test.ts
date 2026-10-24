import { describe, expect, it } from "bun:test";
import { Editor, type EditorBorderStyle } from "@oh-my-pi/pi-tui";
import { visibleWidth } from "@oh-my-pi/pi-tui/utils";
import { defaultEditorTheme } from "./test-themes";

const BORDER_STYLES: readonly EditorBorderStyle[] = [
	"box",
	"band",
	"claude",
	"pi",
	"borderless",
	"rule",
	"field",
	"rail",
];

/** Painted cell of `needle` in the editor's rows, found from the output so the test holds for any chrome. */
function cellOf(rows: readonly string[], needle: string, nth = 0): { row: number; col: number } {
	let seen = 0;
	for (let row = 0; row < rows.length; row++) {
		const plain = Bun.stripANSI(rows[row]!);
		let from = 0;
		for (;;) {
			const at = plain.indexOf(needle, from);
			if (at === -1) break;
			if (seen++ === nth) return { row, col: visibleWidth(plain.slice(0, at)) };
			from = at + 1;
		}
	}
	throw new Error(`"${needle}" not painted in:\n${rows.map(row => Bun.stripANSI(row)).join("\n")}`);
}

function editorWith(text: string): Editor {
	const editor = new Editor(defaultEditorTheme);
	editor.setText(text);
	return editor;
}

describe("Editor.clickAt", () => {
	it("puts the caret on the clicked character and reports the click consumed", () => {
		const editor = editorWith("abcdef");
		const { row, col } = cellOf(editor.render(40), "d");
		expect(editor.clickAt(row, col)).toBe(true);
		expect(editor.getCursor()).toEqual({ line: 0, col: 3 });
	});

	it("snaps clicks left of the text to the line start and right of it to the line end", () => {
		const editor = editorWith("abcdef");
		const { row, col } = cellOf(editor.render(40), "a");
		expect(editor.clickAt(row, 0)).toBe(true);
		expect(editor.getCursor().col).toBe(0);
		expect(editor.clickAt(row, col + 30)).toBe(true);
		expect(editor.getCursor().col).toBe(6);
	});

	it("selects the logical line under the pointer in multi-line input", () => {
		const editor = editorWith("first\nsecond\nthird");
		const { row, col } = cellOf(editor.render(40), "cond");
		expect(editor.clickAt(row, col)).toBe(true);
		expect(editor.getCursor()).toEqual({ line: 1, col: 2 });
	});

	it("maps wrapped visual rows back to source columns and keeps a mid-wrap click inside its segment", () => {
		const editor = editorWith("alpha beta gamma delta epsilon");
		const rows = editor.render(14);
		const tail = cellOf(rows, "epsilon");
		expect(editor.clickAt(tail.row, tail.col + 3)).toBe(true);
		expect(editor.getCursor()).toEqual({ line: 0, col: 23 + 3 });

		// Far right of a non-final segment must not land on the next segment's first column.
		const head = cellOf(rows, "alpha");
		expect(editor.clickAt(head.row, head.col + 40)).toBe(true);
		expect(editor.getCursor().col).toBeLessThan("alpha beta gamma".length);
		expect(editor.getCursor().col).toBeGreaterThan(0);
	});

	it("resolves wide characters by cell, never splitting a grapheme", () => {
		const editor = editorWith("日本語");
		const { row, col } = cellOf(editor.render(40), "本");
		expect(editor.clickAt(row, col)).toBe(true);
		expect(editor.getCursor().col).toBe(1);
		// The right cell of 本 still belongs to 本.
		expect(editor.clickAt(row, col + 1)).toBe(true);
		expect(editor.getCursor().col).toBe(1);
		expect(editor.clickAt(row, col + 2)).toBe(true);
		expect(editor.getCursor().col).toBe(2);
	});

	it("accounts for the scroll offset of a height-capped editor", () => {
		const lines = Array.from({ length: 12 }, (_, index) => `line-${index}`);
		const editor = editorWith(lines.join("\n"));
		editor.setMaxHeight(5);
		const rows = editor.render(40);
		// The caret sits on the last line, so the window shows the tail of the buffer.
		const { row, col } = cellOf(rows, "line-");
		const shown = Bun.stripANSI(rows[row]!).match(/line-(\d+)/)![0];
		expect(editor.clickAt(row, col + 5)).toBe(true);
		expect(editor.getCursor().line).toBe(Number(shown.slice("line-".length)));
		expect(editor.getCursor().line).toBeGreaterThan(0);
	});

	it("ignores rows that are not text and leaves the caret alone", () => {
		const editor = editorWith("abc");
		const { row } = cellOf(editor.render(40), "abc");
		const before = editor.getCursor();
		expect(editor.clickAt(row + 50, 3)).toBe(false);
		expect(editor.clickAt(-1, 3)).toBe(false);
		expect(editor.getCursor()).toEqual(before);
	});

	it("does nothing before the first paint", () => {
		expect(editorWith("abc").clickAt(0, 0)).toBe(false);
	});

	it("moves the caret so the next keystroke inserts at the click", () => {
		const editor = editorWith("helo");
		const { row, col } = cellOf(editor.render(40), "o");
		editor.clickAt(row, col);
		editor.handleInput("l");
		expect(editor.getText()).toBe("hello");
	});

	it("closes an open autocomplete popup so it does not point at a stale caret", async () => {
		const editor = new Editor(defaultEditorTheme);
		editor.setAutocompleteProvider({
			async getSuggestions(lines, cursorLine) {
				return lines[cursorLine] === "@"
					? { items: [{ label: "alpha.ts", value: "@alpha.ts" }], prefix: "@" }
					: null;
			},
			applyCompletion: lines => ({ lines, cursorLine: 0, cursorCol: 0 }),
		});
		const shown = Promise.withResolvers<void>();
		editor.onAutocompleteUpdate = () => {
			if (editor.isShowingAutocomplete()) shown.resolve();
		};
		editor.handleInput("@");
		await shown.promise;
		expect(editor.isShowingAutocomplete()).toBe(true);

		const { row, col } = cellOf(editor.render(40), "@");
		expect(editor.clickAt(row, col)).toBe(true);
		expect(editor.isShowingAutocomplete()).toBe(false);
	});

	it("does not treat a click on the autocomplete list as a click on the text", async () => {
		const editor = new Editor(defaultEditorTheme);
		editor.setAutocompleteProvider({
			async getSuggestions(lines, cursorLine) {
				return lines[cursorLine] === "@"
					? { items: [{ label: "alpha.ts", value: "@alpha.ts" }], prefix: "@" }
					: null;
			},
			applyCompletion: lines => ({ lines, cursorLine: 0, cursorCol: 0 }),
		});
		const shown = Promise.withResolvers<void>();
		editor.onAutocompleteUpdate = () => {
			if (editor.isShowingAutocomplete()) shown.resolve();
		};
		editor.handleInput("@");
		await shown.promise;

		const rows = editor.render(40);
		const popupRow = cellOf(rows, "alpha.ts").row;
		expect(editor.clickAt(popupRow, 2)).toBe(false);
		expect(editor.isShowingAutocomplete()).toBe(true);
	});

	it("keeps Vim normal mode on a grapheme when the click lands past the line end", () => {
		const editor = editorWith("abc");
		editor.setVimMode(true);
		editor.handleInput("\x1b"); // Escape: Insert -> Normal
		const { row, col } = cellOf(editor.render(40), "a");
		editor.clickAt(row, col + 30);
		expect(editor.getCursor().col).toBe(2);
	});

	// The caret must land on the character under the pointer whatever the composer chrome:
	// every built-in style, with and without a prompt gutter, at several side paddings.
	describe("across composer styles, paddings and gutters", () => {
		for (const style of BORDER_STYLES) {
			for (const paddingX of [undefined, 0, 1, 3]) {
				for (const gutter of [undefined, "> "]) {
					const label = `${style} paddingX=${paddingX ?? "default"} gutter=${gutter === undefined ? "default" : "'> '"}`;
					it(`lands on the clicked character: ${label}`, () => {
						const editor = editorWith("abcdef xyz\nqrstuv");
						editor.setBorderStyle(style);
						if (paddingX !== undefined) editor.setPaddingX(paddingX);
						if (gutter !== undefined) editor.setPromptGutter(gutter);
						const rows = editor.render(40);
						for (const [needle, line, col] of [
							["abcdef", 0, 0],
							["cdef", 0, 2],
							["xyz", 0, 7],
							["qrstuv", 1, 0],
							["tuv", 1, 3],
						] as const) {
							const cell = cellOf(rows, needle);
							editor.clickAt(cell.row, cell.col);
							expect(editor.getCursor()).toEqual({ line, col });
						}
					});
				}
			}
		}
	});
});
