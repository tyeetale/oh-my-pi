# AGENTS.md — Bare Repo & Worktree Management

Read this file at the start of every session. It defines how to operate in this repository structure.

For project code conventions, read the `AGENTS.md` and `CONTRIBUTING.md` inside the active worktree. This is an
**external, third-party repository** (`can1357/oh-my-pi`); we work through our fork. It is not a Tyeetale product.

---

## The model: fork, contribution branches, and the `ompx` build

```
upstream (can1357/oh-my-pi)  ──fetch──▶  main  (mirror, never has our commits)
                                           │
                       ┌───────────────────┼───────────────────┐
                       ▼                   ▼                   ▼
             composer-click-to-caret   <next-edit>        (one branch per change,
             (PR-able, one change)                         each based on main)
                       │                   │
                       └───────┬───────────┘
                               ▼
                             ompx   = main + dependency PRs (#15370) + our branches merged in
                               │          (NEVER a PR source)
                               ▼
                  ~/Documents/projects/dotfiles/bin/ompx   runs ompx/ from source
```

- **`main/`** equals `upstream/main`. Fast-forward only. No commits of our own.
- **Contribution branches** (flat worktrees next to `main/`) hold exactly one logical change each, so they can become a PR.
  Base them on `main`. If a change needs an unmerged upstream PR, stack it on that PR's commits and say so in its PR.
- **`ompx/`** is the integration build: `main` + unmerged upstream PRs we depend on + our branches merged in.
  It is what the `ompx` command runs. Anything we want in daily use goes here; nothing is PR'd from it.
- **`ompx` command** (`dotfiles/bin/ompx`) runs `ompx/packages/coding-agent/src/cli.ts` with Bun. Stock `omp` (Homebrew) is untouched.
  It warns on stderr when Homebrew's omp version differs from the branch's (`OMPX_QUIET=1` hides it).

Each worktree is a flat directory at the root. Run code, tests, and builds only from inside a worktree.

## Remotes

| Remote     | URL                                       | Use                                   |
| ---------- | ----------------------------------------- | ------------------------------------- |
| `origin`   | https://github.com/tyeetale/oh-my-pi.git  | Our fork. Back up branches here.      |
| `upstream` | https://github.com/can1357/oh-my-pi.git   | The real project. Fetch only.         |

## Routines

**Add a personal edit to ompx**
1. `git --git-dir=.bare fetch upstream`, then `git worktree add -b <name> <name> main`.
2. Work and commit in `<name>/`; run the checks there. Keep it to one logical change.
3. `cd ompx && git merge <name>`; run `bun install` if dependencies changed. Restart `ompx`.

**Sync after a Homebrew release** (ompx warns when versions differ)
1. Fetch upstream; fast-forward `main/` to `upstream/main`.
2. In `ompx/`: `git merge main` (or rebuild: reset to `main`, then re-merge each branch and dependency PR).
3. Drop whatever upstream has now absorbed: a branch whose change shipped, or a PR that merged.
4. Copy the matching native addon: `cp ~/.omp/natives/<version>/pi_natives.darwin-arm64.node ompx/packages/natives/native/`, then `bun install`.
5. Rerun `ompx --smoke-test` and the tests for the areas the branches touch.
6. When nothing unique remains in `ompx`, delete `dotfiles/bin/ompx` and use `omp`.

**Update a contribution branch when its dependency PR merges**
`git rebase --onto upstream/main <old-dependency-tip> <branch>` drops the borrowed commits. Rerun the checks and retest by hand before pushing.

## Current contents of `ompx`

| Piece | Source | Status |
|---|---|---|
| Component mouse routing | upstream PR #15370 (johnnyshields), merged locally with one conflict resolved in `packages/tui/src/chrome/transcript-container.ts`: keep `main`'s `MeasuredBlock` map and the PR's `#frameRowOffsets` | Open, conflicting upstream when merged |
| Click in the prompt moves the caret | branch `composer-click-to-caret` (`Editor.handleMouse`) | Not yet a PR; waiting on maintainers (Discord) |
| Click acts on release; drag highlights and copies viewport text | branch `mouse-select` (`packages/tui/src/text-selection.ts`, composer selection painting, input-controller gesture state). Built on #15370's routing and `composer-click-to-caret`. | ompx only; not a PR. Selects only rows still in the mutable viewport, not text already in terminal scrollback. The highlight is pinned to the copied text and drops itself if the rows under it change. |

Setup facts for ompx: `tui.mouse` is NOT in the shared `config.yml`; the launcher loads `dotfiles/ai/omp/ompx-overlay.yml` through `PI_CONFIG_FILES`, so stock `omp` keeps official behavior. The launcher uses `exec -a omp bun ...` because herdr identifies agents by process name and ignores a bun process's script path. Sessions started before either change must be restarted to pick it up.

Related upstream PRs, for awareness: #8782 (older click-to-caret plus drag-select), #10584 (Option-click caret). Both open and conflicting.
`proto-standalone-click` and `pr-15370` are local reference refs only.

## Rules from the project (CONTRIBUTING.md / AGENTS.md)

- Large UI or multi-package changes need a Discord discussion **before** implementation. Do not open an issue for work
  we are about to submit; link existing issues/PRs from the PR instead.
- The human submitter writes at least one sentence of the PR body in their own words, reviews every changed file,
  and exercises the feature end to end in a real terminal. An agent must not publish the PR or post comments
  without explicit confirmation of the exact text and target.
- Changelog entries for external contributions carry the PR link and contributor credit, added after GitHub assigns the number.
- Toolchain: Bun >= 1.4. New worktrees need `bun install` and the native addon copied from
  `~/.omp/natives/<version>/pi_natives.darwin-arm64.node` into `packages/natives/native/`.
- Gate: `bun run check:ts` plus the relevant tests. Known baseline failures that also fail without our change:
  7 `packages/tui` tests (`glyph-protocol`, `terminal-appearance`) and one mermaid test in `packages/coding-agent`.
- `tui.mouse` is shared config: `~/.omp/agent/config.yml` is a symlink into `dotfiles/ai/omp/config.yml`.
