import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { KeybindingsManager } from "@oh-my-pi/pi-tui/app-keybindings";
import { resetSettingsForTest, Settings, settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { PINNED_HUD_TOGGLE_ID } from "@oh-my-pi/pi-tui/prompt/composer";
import { InputController } from "@oh-my-pi/pi-coding-agent/modes/controllers/input-controller";
import { SpaceHoldGesture } from "@oh-my-pi/pi-tui/space-hold";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import type { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";

import { cfgTuiMouse } from "@oh-my-pi/pi-coding-agent/modes/settings";

const ESC = String.fromCharCode(27);
// SGR click on viewport row 2 (1-based y=3): the pinned expander row when the
// candidates below resolve it to the toggle sentinel.
const EXPANDER_CLICK = `${ESC}[<0;5;3M`;

function makeHarness(editorRow?: number) {
	const listeners: Array<(data: string) => { consume?: boolean; data?: string } | undefined> = [];
	const editorClicks: Array<[number, number]> = [];
	let renders = 0;
	const focused: string[] = [];
	let toggled = 0;
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
		resolveViewportClickCandidates: (index: number) => (index === 2 ? [PINNED_HUD_TOGGLE_ID] : []),
		clickEditor: (row: number, col: number) => {
			editorClicks.push([row, col]);
			return row === editorRow;
		},
		focusedAgentId: undefined,
		focusAgentSession: async (id: string) => {
			focused.push(id);
		},
		togglePinnedHudExpanded: () => {
			toggled++;
		},
		showStatus: () => {},
		setClickHoverId: () => {},
	} as unknown as InteractiveModeContext;
	const controller = new InputController(ctx);
	controller.setupKeyHandlers();
	return {
		click: () => {
			for (const listener of listeners) listener(EXPANDER_CLICK);
		},
		editorClicks,
		renders: () => renders,
		focused,
		toggled: () => toggled,
	};
}

describe("InputController click routing", () => {
	beforeEach(async () => {
		AgentRegistry.resetGlobalForTests();
		await Settings.init({ inMemory: true });
		cfgTuiMouse.set(settings, true);
	});

	afterEach(() => {
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

	it("sends a click on an editor text row to the editor instead of the agent targets", () => {
		const h = makeHarness(2);
		h.click();
		// SGR column 5 (1-based) reaches the editor as 0-based column 4.
		expect(h.editorClicks).toEqual([[2, 4]]);
		expect(h.renders()).toBe(1);
		expect(h.toggled()).toBe(0);
		expect(h.focused).toEqual([]);
	});

	it("falls through to the agent targets when the click is not on an editor text row", () => {
		const h = makeHarness(0);
		h.click();
		expect(h.editorClicks).toEqual([[2, 4]]);
		expect(h.renders()).toBe(0);
		expect(h.toggled()).toBe(1);
	});
});
