# kleanREST

A git-friendly REST client for teams. Desktop app for testing HTTP APIs, with collections and environments stored as plain files on disk — so version control, code review, and sharing work the way you already work.

Built as an in-house alternative to subscription-based REST clients.

---

## Why

Most REST clients keep your work in a proprietary cloud and charge per seat for team sharing. kleanREST keeps everything on disk as JSON files inside a folder you control. Share it through git, a network drive, Dropbox — whatever matches how your team already collaborates.

- **Collections, environments, and requests are plain files.** Diffable, reviewable, searchable with grep.
- **Secrets stay out of commits.** Variables marked `secret` are kept in a gitignored store, never in the committed environment files.
- **Per-project git integration.** Pull, commit, and push straight from the app.
- **No account. No cloud. No seat licenses.**

## Features

- Collections organized as folders; requests as `.request.json` files
- Environment variables with typed `secret` flag and secret-splitting
- Request history per project (gitignored, with sensitive headers redacted)
- cURL import
- Postman dump import (full projects + environments)
- Multi-workspace support
- Auto-update from GitHub Releases
- Dark theme UI

## Download

Latest installers for Windows and macOS are published on the [Releases page](https://github.com/klean/kleanREST/releases/latest).

- **Windows:** `kleanREST-<version>-x64.exe` (NSIS installer)
- **macOS:** `kleanREST-<version>.dmg` (Intel and Apple Silicon)

Linux builds can be enabled in the GitHub Actions workflow if needed.

## Project structure

```
kleanREST/
├── .github/workflows/        GitHub Actions CI (build & release)
└── app/                      The Electron app
    ├── src/
    │   ├── main/             Main process (IPC, HTTP, git, project loader, updater)
    │   ├── preload/          Preload bridge (typed, whitelisted IPC surface)
    │   ├── renderer/         React UI
    │   └── shared/           Types shared between main and renderer
    ├── electron-builder.yml  Packaging config
    └── electron.vite.config.ts
```

## How projects are stored

A kleanREST project is a folder on disk. It looks like this:

```
my-project/
├── kleanrest.project.json    Project config
├── collections/
│   └── users/
│       ├── collection.json
│       ├── list-users.request.json
│       └── get-user.request.json
├── environments/
│   ├── dev.env.json          Non-secret values only
│   └── prod.env.json
├── .kleanrest/               Gitignored
│   ├── history/              Request history
│   └── secrets/              Secret values, per environment
└── .gitignore
```

Commit `collections/`, `environments/`, and `kleanrest.project.json` to git. Everything under `.kleanrest/` stays local.

## Development

Requires Node 20+.

```bash
cd app
npm install
npm run dev         # Start in dev mode with hot reload
npm run typecheck   # TypeScript check (main + renderer)
npm run build       # Production build (no packaging)
```

### Packaging locally

```bash
npm run package:win      # Windows NSIS installer
npm run package:mac      # macOS DMG
npm run package:linux    # Linux AppImage + deb
```

Output goes to `app/dist/`.

## Release flow

Releases are driven by the version in `app/package.json`:

1. Bump the `version` field in `app/package.json` (e.g., `1.0.0` → `1.1.0`)
2. Commit and push to `master`
3. The `Build & Release` workflow in `.github/workflows/build.yml` detects the version change, builds for each platform in parallel, and publishes a GitHub Release tagged `v<version>` with all installers attached

If the version hasn't changed vs the previous commit, the workflow exits early — no duplicate releases.

The auto-updater in the installed app polls GitHub Releases on startup and prompts the user when a newer version is available.

## Security

A few design choices worth calling out:

- **Renderer runs with `sandbox: true` and `contextIsolation: true`.** The preload exposes only a narrow IPC surface; channel names are validated against a whitelist derived from `keyof IpcChannels`.
- **Every path-receiving IPC handler validates against registered workspaces.** A compromised renderer can't ask the main process to read/write files outside a workspace the user has explicitly added.
- **HTTP client bounds are clamped.** `maxRedirects` and `timeout` from the renderer are bounded server-side to prevent pathological values.
- **History header redaction.** Sensitive header names (`authorization`, `cookie`, `x-api-key`, etc.) are stripped before request history is persisted.
- **`shell.openExternal` filters URLs.** Only `http:` and `https:` protocols are opened.

## Tech stack

- Electron 33
- React 18 + Tailwind CSS
- Zustand for state
- electron-vite for dev/build
- electron-builder for packaging
- electron-updater for auto-update
- CodeMirror 6 for request/response bodies
- Radix UI primitives

## Status

Internal tool. No public contribution workflow right now — if you want to use it for your team, clone or fork the repo and adjust the `publish` section of `electron-builder.yml` to point at your own releases.
