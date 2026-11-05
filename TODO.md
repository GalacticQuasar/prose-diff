# TODO

## Next

- [x] `--open`: launch the browser on startup (`xdg-open`; `wslview` or `cmd.exe /c start` on WSL).
- [ ] Multiple projects in paste mode: keep several original/revised pairs in progress and switch between them from a header menu (new, switch, rename, delete). Today there's one pair under `prose-diff:v1`, so starting another replaces it, and two tabs overwrite each other. Store each project's texts, decisions, `decisionsKey`, `focusedId` and view separately from the shared theme and measure, migrate an existing `prose-diff:v1` entry into the first project, track the open project per tab, and show a clear error when `localStorage` is full.
- [ ] Replace the native `confirm()` before applying with undecided changes with a dialog in the app's style.

## Later, if wanted

- [ ] Several files per session.
- [ ] Snapshots persisted on disk (`--resume`).
- [ ] Undo for the last apply.
- [ ] Keep decisions across a reload for changes that are still identical.
