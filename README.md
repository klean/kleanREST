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
- Postman dump import (full projects + environments, or single collection with merge)
- Multi-workspace support
- Auto-update from GitHub Releases
- Optional built-in **MCP server** for Claude Code integration (see below)
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

## Claude Code integration (MCP)

kleanREST can expose your projects, collections, and requests to [Claude Code](https://claude.com/claude-code) — or any MCP-compatible AI client — through an optional built-in **MCP server**. When an AI agent fires a saved request through this server, it runs the HTTP call through kleanREST itself, so the request shows up live in the history and response viewer — you can follow every call the AI makes.

### Enable the server

The MCP server is **off by default**. To turn it on:

1. Open kleanREST → top-bar gear menu → **Settings...**
2. In the **MCP Server** section, flip the toggle on.

The app picks a random free port on `127.0.0.1` and generates a token on first enable. Both are persisted, so the URL and token stay stable across restarts (until you rotate the token).

### Connect Claude Code

The Settings dialog shows a ready-made config snippet. Copy it into your Claude Code MCP config. For a global config (`~/.claude.json`) or per-project (`.claude/mcp.json`), it looks like:

```json
{
  "mcpServers": {
    "kleanrest": {
      "type": "http",
      "url": "http://127.0.0.1:PORT/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Restart Claude Code after adding the config. kleanREST must be running for the connection to succeed — if the app isn't open, Claude Code will see the MCP server as unreachable.

### Available tools

**Discovery / read:**

| Tool                   | What it does |
| ---------------------- | ------------ |
| `list_workspaces`      | All registered workspaces |
| `list_projects`        | Projects in a workspace (defaults to the last-active one) |
| `list_collections`     | All collections + sub-collections in a project |
| `list_requests`        | All requests in a project, optionally filtered to a collection |
| `get_request`          | Full definition of a single request |
| `list_environments`    | Environments in a project. Secret values are blanked in the response. |
| `list_all_collections` | Top-level collections across every project in a workspace (discovery helper) |
| `list_history`         | Recent history entries for a project. Sensitive headers redacted. |

**Execute:**

| Tool                  | What it does |
| --------------------- | ------------ |
| `send_request`        | Execute a saved request, resolving `{{vars}}` via the chosen environment. Appears in the UI history in real time. Returns status, headers, body, and timing. |
| `send_ad_hoc_request` | Fire a raw `{ method, url, headers, body }` without saving it first. Useful for exploratory calls. Also appears in the UI history if a `projectPath` is passed. |

**Write:**

| Tool                | What it does |
| ------------------- | ------------ |
| `create_collection` | Create a new collection at the project root or as a sub-collection |
| `delete_collection` | Delete a collection and everything inside it |
| `create_request`    | Create a saved request inside a collection. Can populate initial fields in one call (method, url, headers, body, auth, queryParams). |
| `update_request`    | Patch fields on an existing request — only pass what you want to change |
| `delete_request`    | Delete a saved request |
| `set_variable`      | Create or update a variable in an environment. Supports `secret: true` so captured tokens stay out of committed files. Pair with `send_request` for multi-step auth flows — call login, extract a token from the response, `set_variable("access_token", ...)`, then every subsequent request using `{{access_token}}` gets the real value. |

### Security notes

- The server binds only to `127.0.0.1` — nothing on the LAN can reach it.
- Every request must include the token in the `Authorization` header; mismatched tokens return 401.
- You can rotate the token from the Settings dialog at any time. Any connected clients will need to update their config to the new token.
- The server only touches paths inside registered workspaces. Attempts to act on paths outside your workspaces are rejected.
- Env variables marked `secret` are never sent out in `list_environments`. They **are** resolved server-side when `send_request` runs, so outgoing requests receive real values — but history entries redact sensitive response / request headers.
- If the server fails to start (e.g. port conflict), the Settings dialog shows the error and the toggle reverts.

### Where the MCP config lives

- Windows: `%APPDATA%\kleanREST\mcp.json`
- macOS: `~/Library/Application Support/kleanREST/mcp.json`
- Linux: `~/.config/kleanREST/mcp.json`

You shouldn't need to edit this by hand — the Settings dialog is the supported way.

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
