# Composer click-to-caret: contribution handoff

Branch: `composer-click-to-caret` in `~/Documents/projects/other/oh-my-pi.git/composer-click-to-caret/`
(one commit, `b2e9e10f5c`, stacked on a local merge of upstream PR #15370). Pushed to the fork `tyeetale/oh-my-pi`
(branches `composer-click-to-caret` and `ompx`); no issue, comment or PR has been opened upstream.

Status log (update as things happen): Discord message sent. Tested by hand in a plain terminal tab and inside herdr; clicking
places the caret correctly in both. Daily use goes through `ompx` (runs the `ompx` integration branch; see `AGENTS.md` here).
Related upstream PRs found later: #10584 (Option-click caret) and #8782, both open and conflicting. Not mentioned in Discord.

## 1. Discord post (you send it; edit freely)

> Hi, I'd like to add click-to-position-caret in the prompt box, opt-in under the existing `tui.mouse` setting
> (no new setting, no new tracking mode, no default change). Context: #9848 asked for it (closed as a duplicate of #8782),
> #8782 is stale and conflicting, and #15370 adds `Component.handleMouse()` routing. My change is only
> `Editor.handleMouse(event: SgrMouseEvent): boolean`, about 70 lines plus tests, built on #15370's contract, so it needs
> #15370 first. It maps the click through the painted row (handles wrapped lines, scrolling, wide chars, every composer
> style and padding) and ignores everything except a left press. Drag-select and double-click are left to the #11438
> selection model. Two questions: (1) is #15370's `handleMouse` contract settled enough to build on, and should I wait for
> it to merge or open a PR now with it as a prerequisite? (2) Should a click keep history-browsing mode (as the arrow keys
> do) or exit it?

## 2. Your end-to-end verification (CONTRIBUTING requires you to do this yourself)

```sh
cd ~/Documents/projects/other/oh-my-pi.git/composer-click-to-caret
printf 'tui:\n  mouse: true\n' > /tmp/omp-mouse-overlay.yml          # overlay only; your config.yml is untouched
PI_CONFIG_FILES=/tmp/omp-mouse-overlay.yml bun packages/coding-agent/src/cli.ts
```

In the real terminal you use, try each and note the result (or the terminal and multiplexer if something differs):

1. Type `the quick brown fox`; click in the middle of `quick`. Type `X`. It should insert at the click.
2. Paste or type a long line that wraps over 3+ rows; click on each row, near both ends. Never lands on the wrong row.
3. Make 4+ lines using your configured newline key, then click each line (including an empty one). Also grow the prompt past its maximum height so it scrolls, and click rows while scrolled.
4. Click right of the end of a line, and left of the start (in the border area). Caret goes to the end/start.
5. Type `@` or `/` so a popup opens; click in the text. Popup closes, caret moves.
6. Click on the top border and the status line. Nothing in the prompt changes.
7. With a subagent card on screen, click the card. It still focuses (the old behavior).
8. Turn it off (run without the overlay): clicks do nothing special and native selection works.
9. If you use tmux, herdr or another multiplexer, repeat 1 inside it.

## 3. What to review (every file; the diff is 5 files, ~350 lines)

| File | What changed |
|---|---|
| `packages/tui/src/components/editor.ts` | `#paintGeometry` captured in `render()`; new `handleMouse(event)`. Ignores anything but a left press; maps the click to a layout row (scroll offset, top chrome), measures the cells before the text off the painted row, snaps to a grapheme boundary, clamps non-final wrap segments, clamps Vim normal mode, closes autocomplete. |
| `packages/tui/test/editor-click.test.ts` | New. Behavior tests plus a matrix: every built-in composer style x padding (default/0/1/3) x prompt gutter, clicking each painted character. |
| `packages/tui/test/composer-click.test.ts` | Two tests: editor mounted as `InteractiveMode` mounts it is reached through #15370's routing, including a clipped viewport. |
| `packages/coding-agent/src/modes/settings.ts`, `docs/settings.md` | `tui.mouse` description now mentions the prompt caret. |

Design points to be ready to explain: why the offset is measured from the painted row and not computed from style chrome (the
matrix found `claude`/`rule` with padding and `box` with padding 0 disagree with the declared chrome width); why a click stays
in history browsing; why press, not release (matches the existing card click; drag/double-click belong to #11438).

## 4. Verification already run (by me; not a substitute for section 2)

- `bun run check:ts` equivalent: oxlint + oxfmt clean on all changed files, `check:types` passes for every package (Bun 1.4.4).
- `packages/tui` full suite: 4108 pass, 7 fail. Same 7 fail on the stack branch without my commit (glyph-protocol, terminal-appearance).
- `packages/coding-agent/test/modes` + click tests: one mermaid test fails identically on the stack branch.
- New tests: 77 in editor-click, mutation-checked (removing the Vim clamp, the autocomplete cancel, or the scroll offset each fails exactly its test).
- Throwaway end-to-end test through real `InteractiveMode` + input controller + SGR bytes in a virtual terminal: clicks moved the caret; release, motion and wheel did not. Deleted afterwards.
- Not done: a real terminal, a real multiplexer, Windows. That is yours.

## 5. PR body skeleton (template sections kept; the bracketed parts are yours)

```
## What

[YOUR OWN SENTENCE(S), required by CONTRIBUTING.md: what changed and why, in your words.]

With `tui.mouse` on, a left click in the prompt now moves the caret to the clicked cell (`Editor.handleMouse`), building on
#15370's `Component.handleMouse` routing. Relates to #9848 and #8782; complements #11438 (selection stays out of scope).

## Why

[Your motivation. Facts available: Pi has this in fullscreen mode; omp's `tui.mouse` only handled subagent cards.]

## Testing

[Exact scenarios you ran from section 2 and the results, per terminal.]
Automated: editor-click matrix across styles/paddings/gutters; composer routing incl. clipped viewport; `check:types` all packages;
full tui suite (the same 7 pre-existing failures occur without this change).

---
- [ ] `bun check` passes
- [ ] Tested locally
- [ ] CHANGELOG updated with the required attribution
```

## 6. After the PR number exists (add to the same branch, then push)

`packages/tui/CHANGELOG.md` under `## [Unreleased]` / `### Added`:
`- Added `Editor.handleMouse`, which moves the prompt caret to a clicked cell (wrapped rows, scrolled windows, wide characters, prompt gutters and every composer style included) ([#NNNN](https://github.com/can1357/oh-my-pi/pull/NNNN) by [@tyeetale](https://github.com/tyeetale))`

`packages/coding-agent/CHANGELOG.md` under `## [Unreleased]` / `### Added`:
`- With `tui.mouse` on, clicking in the prompt box now moves the caret to the clicked position ([#NNNN](https://github.com/can1357/oh-my-pi/pull/NNNN) by [@tyeetale](https://github.com/tyeetale))`

## 7. Sequencing

1. Discord (you). 2. Wait for the answer; the likely forks are "#15370 first" or "open it now as a draft/stacked".
3. While #15370 is unmerged the PR's diff against `main` would include its ~1,300 lines, so do not open it until you know the plan.
4. When #15370 lands, rebase per `oh-my-pi.git/AGENTS.md`, rerun checks, do section 2 again on the rebased branch, then push to your fork.
