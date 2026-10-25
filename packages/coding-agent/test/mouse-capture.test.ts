import { describe, expect, it } from "bun:test";
import {
	type MouseCaptureState,
	shouldCaptureMouse,
	WHEEL_RELEASE_MS,
} from "@oh-my-pi/pi-coding-agent/modes/mouse-capture";

const NOW = 1_000_000;

function state(overrides: Partial<MouseCaptureState>): MouseCaptureState {
	return { enabled: true, smart: true, hasDraft: true, wheelReleaseUntil: 0, now: NOW, ...overrides };
}

describe("shouldCaptureMouse", () => {
	it("never captures while the master switch is off, whatever else is true", () => {
		expect(shouldCaptureMouse(state({ enabled: false }))).toBe(false);
		expect(shouldCaptureMouse(state({ enabled: false, smart: false }))).toBe(false);
	});

	it("keeps capturing without smart capture, with or without a draft and through a wheel release", () => {
		expect(shouldCaptureMouse(state({ smart: false, hasDraft: false }))).toBe(true);
		expect(shouldCaptureMouse(state({ smart: false, wheelReleaseUntil: NOW + WHEEL_RELEASE_MS }))).toBe(true);
	});

	it("captures under smart capture only while the prompt has a draft", () => {
		expect(shouldCaptureMouse(state({ hasDraft: true }))).toBe(true);
		expect(shouldCaptureMouse(state({ hasDraft: false }))).toBe(false);
	});

	it("lets go while a wheel release is active and takes the mouse back when it lapses", () => {
		const until = NOW + WHEEL_RELEASE_MS;
		expect(shouldCaptureMouse(state({ wheelReleaseUntil: until, now: NOW }))).toBe(false);
		expect(shouldCaptureMouse(state({ wheelReleaseUntil: until, now: until - 1 }))).toBe(false);
		expect(shouldCaptureMouse(state({ wheelReleaseUntil: until, now: until }))).toBe(true);
	});

	it("stays released after the wheel when the draft is gone too", () => {
		expect(shouldCaptureMouse(state({ hasDraft: false, wheelReleaseUntil: NOW + 1, now: NOW + 5 }))).toBe(false);
	});
});
