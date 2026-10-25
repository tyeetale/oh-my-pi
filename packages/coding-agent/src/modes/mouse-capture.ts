/**
 * When omp asks the terminal to report the mouse.
 *
 * A reporting terminal sends clicks, drags and the wheel to omp and stops doing its own selection and
 * scrolling. The plain policy keeps reporting on whenever `tui.mouse` is. The smart policy
 * (`tui.mouseSmart`) keeps the terminal's own scrolling and selection (or a multiplexer's) for as long
 * as omp has no use for the mouse:
 *
 * - reporting is on only while the prompt has a draft, since a click only matters when there is text to
 *   place a caret in;
 * - the wheel always wins: when it moves while reporting is on, omp lets go for {@link WHEEL_RELEASE_MS}
 *   so the terminal scrolls that gesture, then takes the mouse back.
 */

/** How long reporting stays off after the wheel moved, giving the terminal the rest of the scroll gesture. */
export const WHEEL_RELEASE_MS = 2500;

export interface MouseCaptureState {
	/** `tui.mouse`: the master switch, also what `/mouse off` flips for the session. */
	enabled: boolean;
	/** `tui.mouseSmart`. */
	smart: boolean;
	/** The prompt holds text. */
	hasDraft: boolean;
	/** Epoch milliseconds before which a wheel release keeps reporting off; 0 when none is active. */
	wheelReleaseUntil: number;
	now: number;
}

export function shouldCaptureMouse(state: MouseCaptureState): boolean {
	if (!state.enabled) return false;
	if (!state.smart) return true;
	return state.hasDraft && state.now >= state.wheelReleaseUntil;
}
