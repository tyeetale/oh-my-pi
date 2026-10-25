import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { KeybindingsManager } from "@oh-my-pi/pi-tui/app-keybindings";
import { resetSettingsForTest, Settings, settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { PINNED_HUD_TOGGLE_ID } from "@oh-my-pi/pi-tui/prompt/composer";
import { InputController } from "@oh-my-pi/pi-coding-agent/modes/controllers/input-controller";
import { SpaceHoldGesture } from "@oh-my-pi/pi-tui/space-hold";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import type { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import * as clipboard from "@oh-my-pi/pi-coding-agent/utils/clipboard";

import { cfgTuiMouse, cfgTuiMouseSmart } from "@oh-my-pi/pi-coding-agent/modes/settings";

const ESC = String.fromCharCode(27);

type Cell = { row: number; col: number };
type Selection = { anchor: Cell; head: Cell };

/** SGR report for `button` at a 0-based cell; the wire format is 1-based and `m` marks a release. */
function sgr(button: number, cell: Cell, release = false): string {
	return `${ESC}[<${button};${cell.col + 1};${cell.row + 1}${release ? "m" : "M"}`;
}

// Viewport row 2: the pinned expander row when the candidates below resolve it to the toggle sentinel.
const EXPANDER: Cell = { row: 2, col: 4 };

function makeHarness() {
	const listeners: Array<(data: string) => { consume?: boolean; data?: string } | undefined> = [];
	const focused: string[] = [];
	const dispatched: Cell[] = [];
	const hovered: Array<string | undefined> = [];
	const statuses: string[] = [];
	const warnings: string[] = [];
	let toggled = 0;
	let renders = 0;
	let pins = 0;
	let releases = 0;
	let resumes = 0;
	let mouseDispatch: "none" | "delivered" | "consumed" = "none";
	let selection: Selection | undefined;
	let selectionText = "";
	const ctx = {
		ui: {
			addInputListener: (fn: (data: string) => { consume?: boolean; data?: string } | undefined) => {
				listeners.push(fn);
			},
			getMutableViewport: () => ({ top: 0, length: 5 }),
			hasOverlay: () => false,
			requestRender: () => {
				renders++;
			},
			addStartListener: () => {},
			getFocused: () => undefined,
		},
		handlesBtwBranchKey: () => false,
		editor: {
			getText: () => "",
			setActionKeys: () => {},
			setCustomKeyHandler: () => {},
			clearCustomKeyHandlers: () => {},
			spaceHold: new SpaceHoldGesture(() => {}),
		},
		keybindings: KeybindingsManager.inMemory(),
		settings,
		dictationSpaceHold: () => undefined,
		session: {
			extensionRunner: undefined,
		},
		dispatchViewportMouse: (event: Cell) => {
			dispatched.push({ row: event.row, col: event.col });
			return mouseDispatch;
		},
		resolveViewportClickCandidates: (index: number) => (index === 2 ? [PINNED_HUD_TOGGLE_ID] : []),
		focusedAgentId: undefined,
		focusAgentSession: async (id: string) => {
			focused.push(id);
		},
		togglePinnedHudExpanded: () => {
			toggled++;
		},
		showStatus: (message: string) => {
			statuses.push(message);
		},
		showWarning: (message: string) => {
			warnings.push(message);
		},
		setClickHoverId: (id: string | undefined) => {
			hovered.push(id);
		},
		setScreenSelection: (range: Selection | undefined) => {
			selection = range;
		},
		hasViewportSelection: () => selection !== undefined,
		viewportSelectionText: () => selectionText,
		pinViewportSelection: () => {
			pins++;
		},
		releaseMouseForScroll: () => {
			releases++;
		},
		endMouseScrollRelease: () => {
			resumes++;
		},
	} as unknown as InteractiveModeContext;
	const controller = new InputController(ctx);
	controller.setupKeyHandlers();
	const send = (data: string) => {
		return listeners.map(listener => listener(data));
	};
	return {
		send,
		press: (cell: Cell) => send(sgr(0, cell)),
		drag: (cell: Cell) => send(sgr(32, cell)),
		release: (cell: Cell) => send(sgr(0, cell, true)),
		click: (cell: Cell = EXPANDER) => {
			send(sgr(0, cell));
			send(sgr(0, cell, true));
		},
		focused,
		dispatched,
		hovered,
		statuses,
		warnings,
		toggled: () => toggled,
		renders: () => renders,
		pins: () => pins,
		releases: () => releases,
		resumes: () => resumes,
		selection: () => selection,
		setSelectionText: (text: string) => {
			selectionText = text;
		},
		setMouseDispatch: (result: "none" | "delivered" | "consumed") => {
			mouseDispatch = result;
		},
	};
}

describe("InputController click routing", () => {
	beforeEach(async () => {
		AgentRegistry.resetGlobalForTests();
		await Settings.init({ inMemory: true });
		cfgTuiMouse.set(settings, true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		AgentRegistry.resetGlobalForTests();
		resetSettingsForTest();
	});

	it("focuses a live agent whose id equals the toggle sentinel", () => {
		AgentRegistry.global().register({
			id: PINNED_HUD_TOGGLE_ID,
			displayName: "evil",
			kind: "sub",
			session: {} as unknown as AgentSession,
			sessionFile: null,
		});
		const h = makeHarness();
		h.click();
		expect(h.focused).toEqual([PINNED_HUD_TOGGLE_ID]);
		expect(h.toggled()).toBe(0);
	});

	it("toggles when no live agent matches the sentinel", () => {
		const h = makeHarness();
		h.click();
		expect(h.toggled()).toBe(1);
		expect(h.focused).toEqual([]);
	});

	it("requests a render when a component receives a non-consuming click", () => {
		const h = makeHarness();
		h.setMouseDispatch("delivered");
		h.click();
		expect(h.renders()).toBe(1);
	});
});

describe("InputController click and drag gestures", () => {
	beforeEach(async () => {
		AgentRegistry.resetGlobalForTests();
		await Settings.init({ inMemory: true });
		cfgTuiMouse.set(settings, true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		AgentRegistry.resetGlobalForTests();
		resetSettingsForTest();
	});

	it("acts on the release of a click, not on the press", () => {
		const h = makeHarness();
		h.setMouseDispatch("consumed");
		h.press({ row: 3, col: 7 });
		expect(h.dispatched).toEqual([]);
		h.release({ row: 3, col: 7 });
		expect(h.dispatched).toEqual([{ row: 3, col: 7 }]);
	});

	it("treats a press-and-release in different cells as a drag that clicks nothing", () => {
		const copy = vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(undefined);
		const h = makeHarness();
		h.setSelectionText("picked text");
		h.press({ row: 3, col: 7 });
		h.drag({ row: 3, col: 9 });
		h.drag({ row: 4, col: 2 });
		h.release({ row: 4, col: 2 });
		expect(h.dispatched).toEqual([]);
		expect(h.toggled()).toBe(0);
		expect(h.focused).toEqual([]);
		expect(h.selection()).toEqual({ anchor: { row: 3, col: 7 }, head: { row: 4, col: 2 } });
		expect(copy).toHaveBeenCalledWith("picked text");
	});

	it("pins the highlight when a drag finishes and shows no notice that would shift the rows under it", async () => {
		vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(undefined);
		const h = makeHarness();
		h.setSelectionText("picked text");
		h.press({ row: 1, col: 0 });
		h.drag({ row: 1, col: 5 });
		expect(h.pins()).toBe(0);
		h.release({ row: 1, col: 5 });
		await Promise.resolve();
		expect(h.pins()).toBe(1);
		expect(h.statuses).toEqual([]);
	});

	it("warns instead of reporting success when the clipboard write fails", async () => {
		vi.spyOn(clipboard, "copyToClipboard").mockRejectedValue(new Error("no clipboard"));
		const h = makeHarness();
		h.setSelectionText("picked text");
		h.press({ row: 1, col: 0 });
		h.drag({ row: 1, col: 5 });
		h.release({ row: 1, col: 5 });
		await Promise.resolve();
		await Promise.resolve();
		expect(h.statuses).toEqual([]);
		expect(h.warnings).toEqual(["Failed to copy selection to clipboard"]);
	});

	it("drops a selection that covers only blank rows instead of copying nothing", () => {
		const copy = vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(undefined);
		const h = makeHarness();
		h.setSelectionText("");
		h.press({ row: 1, col: 0 });
		h.drag({ row: 2, col: 0 });
		h.release({ row: 2, col: 0 });
		expect(copy).not.toHaveBeenCalled();
		expect(h.selection()).toBeUndefined();
	});

	describe("smart capture", () => {
		it("lets go of the mouse when the wheel moves, so the terminal can scroll", () => {
			cfgTuiMouseSmart.override(settings, true);
			const h = makeHarness();
			h.send(sgr(64, { row: 2, col: 4 })); // wheel up
			h.send(sgr(65, { row: 2, col: 4 })); // wheel down
			expect(h.releases()).toBe(2);
		});

		it("abandons a half-made click or drag when the wheel moves", () => {
			cfgTuiMouseSmart.override(settings, true);
			const h = makeHarness();
			h.press({ row: 3, col: 7 });
			h.send(sgr(64, { row: 3, col: 7 }));
			h.release({ row: 3, col: 7 });
			expect(h.dispatched).toEqual([]);
			expect(h.toggled()).toBe(0);
		});

		it("only swallows the wheel without smart capture, since nothing can scroll for the user", () => {
			cfgTuiMouseSmart.override(settings, false);
			const h = makeHarness();
			expect(h.send(sgr(64, { row: 2, col: 4 }))).toContainEqual({ consume: true });
			expect(h.releases()).toBe(0);
		});

		it("takes the mouse back on a key press, and still hands the key to the editor", () => {
			const h = makeHarness();
			// Nothing consumes the key, so the editor still gets it.
			expect(h.send("a")).not.toContainEqual({ consume: true });
			expect(h.resumes()).toBe(1);
		});

		it("does not treat a click as a reason to release the mouse", () => {
			cfgTuiMouseSmart.override(settings, true);
			const h = makeHarness();
			h.click();
			expect(h.releases()).toBe(0);
		});
	});

	it("keeps the highlight after the drag and clears it on the next press", () => {
		vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(undefined);
		const h = makeHarness();
		h.setSelectionText("picked text");
		h.press({ row: 1, col: 0 });
		h.drag({ row: 1, col: 5 });
		h.release({ row: 1, col: 5 });
		expect(h.selection()).toBeDefined();
		h.press({ row: 4, col: 4 });
		expect(h.selection()).toBeUndefined();
	});

	it("clears the highlight on a key press and lets the key through", () => {
		vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(undefined);
		const h = makeHarness();
		h.setSelectionText("picked text");
		h.press({ row: 1, col: 0 });
		h.drag({ row: 1, col: 5 });
		h.release({ row: 1, col: 5 });
		expect(h.selection()).toBeDefined();
		// Nothing consumes the key: the editor still gets it.
		expect(h.send("a")).not.toContainEqual({ consume: true });
		expect(h.selection()).toBeUndefined();
	});

	it("ignores drags of other buttons and the wheel", () => {
		const copy = vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(undefined);
		const h = makeHarness();
		h.setSelectionText("picked text");
		h.press({ row: 1, col: 0 });
		h.send(sgr(34, { row: 1, col: 5 })); // right-button drag
		h.send(sgr(64, { row: 1, col: 5 })); // wheel up
		expect(h.selection()).toBeUndefined();
		h.release({ row: 1, col: 0 });
		expect(copy).not.toHaveBeenCalled();
	});

	it("keeps hovering when no button is held", () => {
		const h = makeHarness();
		h.send(sgr(35, { row: 2, col: 4 }));
		expect(h.hovered).toEqual([PINNED_HUD_TOGGLE_ID]);
		expect(h.selection()).toBeUndefined();
	});

	it("does not hover while a drag is in progress", () => {
		const h = makeHarness();
		h.press({ row: 2, col: 1 });
		h.drag({ row: 2, col: 4 });
		expect(h.hovered).toEqual([]);
	});

	it("ignores a release it never saw a press for", () => {
		const h = makeHarness();
		h.release({ row: 2, col: 4 });
		expect(h.dispatched).toEqual([]);
		expect(h.toggled()).toBe(0);
	});
});
