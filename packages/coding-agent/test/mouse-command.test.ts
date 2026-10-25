import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { resetSettingsForTest, Settings, settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { cfgTuiMouse } from "@oh-my-pi/pi-coding-agent/modes/settings";
import { BUILTIN_SLASH_COMMANDS_INTERNAL } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry";
import type { TuiSlashCommandRuntime } from "@oh-my-pi/pi-coding-agent/slash-commands/types";

function runMouse(args: string) {
	const spec = BUILTIN_SLASH_COMMANDS_INTERNAL.find(command => command.name === "mouse");
	if (!spec?.handleTui) throw new Error("/mouse is not registered as a TUI command");
	const notices: string[] = [];
	const warnings: string[] = [];
	let cleared = 0;
	const runtime = {
		ctx: {
			settings,
			editor: {
				setText: () => {
					cleared++;
				},
			},
			showStatus: (message: string) => notices.push(message),
			showWarning: (message: string) => warnings.push(message),
		},
	} as unknown as TuiSlashCommandRuntime;
	spec.handleTui({ name: "mouse", args, text: `/mouse ${args}`.trim() }, runtime);
	return { notices, warnings, cleared };
}

describe("/mouse", () => {
	beforeEach(async () => {
		await Settings.init({ inMemory: true });
	});

	afterEach(() => {
		resetSettingsForTest();
	});

	it("turns capture off and on explicitly", () => {
		cfgTuiMouse.override(settings, true);
		runMouse("off");
		expect(cfgTuiMouse.get(settings)).toBe(false);
		runMouse("on");
		expect(cfgTuiMouse.get(settings)).toBe(true);
	});

	it("flips the current state when given no argument", () => {
		cfgTuiMouse.override(settings, true);
		runMouse("");
		expect(cfgTuiMouse.get(settings)).toBe(false);
		runMouse("");
		expect(cfgTuiMouse.get(settings)).toBe(true);
	});

	it("keeps a runtime choice out of the saved setting, so the next launch starts as configured", () => {
		cfgTuiMouse.set(settings, true);
		runMouse("off");
		expect(cfgTuiMouse.get(settings)).toBe(false);
		cfgTuiMouse.clearOverride(settings);
		expect(cfgTuiMouse.get(settings)).toBe(true);
	});

	it("rejects an unknown argument without changing anything", () => {
		cfgTuiMouse.override(settings, true);
		const { warnings, notices } = runMouse("sideways");
		expect(warnings).toEqual(["Usage: /mouse [on|off]"]);
		expect(notices).toEqual([]);
		expect(cfgTuiMouse.get(settings)).toBe(true);
	});

	it("tells the user which way it went and clears the submitted text", () => {
		const off = runMouse("off");
		expect(off.notices[0]).toContain("released");
		expect(off.cleared).toBe(1);
		const on = runMouse("on");
		expect(on.notices[0]).toContain("captured");
	});
});
