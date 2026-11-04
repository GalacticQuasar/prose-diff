# TODO

## Next

- [ ] `--open`: launch the browser on startup (`xdg-open`; `wslview` or `cmd.exe /c start` on WSL).
- [ ] Dev proxy: `vite.config.ts` proxying `/api` to a running `prose-diff` (e.g. when `PROSE_DIFF_API` is set), plus a CLI flag to serve only the API, so `npm run dev` works in file mode.
- [ ] Replace the native `confirm()` before applying with undecided changes with a dialog in the app's style.

## Later, if wanted

- [ ] Several files per session.
- [ ] Snapshots persisted on disk (`--resume`).
- [ ] Undo for the last apply.
- [ ] Keep decisions across a reload for changes that are still identical.
