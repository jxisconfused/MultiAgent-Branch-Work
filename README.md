# Snip: One API, Two Clients

Snip is a tiny URL shortener with one Bun backend and two clients: an Angular web app and a zero-dependency Node CLI. The web app and terminal client use the same API and see the same in-memory links.

## Repository Layout

Each project lives on its own orphan branch with files at that branch's root. The `main` branch composes them as submodules, pinning each folder to a specific commit:

```text
snip-demo/
├── backend/    Bun API and short-code redirects  (branch: backend)
├── frontend/   Angular 19 web client             (branch: frontend)
├── cli/        Node.js command-line client       (branch: cli)
├── bundle/     Generated deployable release      (branch: bundle)
├── scripts/    Release bundle generator
├── .gitmodules
└── README.md
```

The link store is an in-memory `Map`; restarting the backend clears all links.

## API Contract

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `POST` | `/api/links` | `{ "url": "https://example.com" }` | `201` `{ code, url, shortUrl, hits, createdAt }`; `400` for invalid JSON or a non-HTTP(S) URL |
| `GET` | `/api/links` | — | `200` array of link objects with the same shape |
| `GET` | `/:code` | — | `302` to the destination and increments `hits`; `404` if unknown |

The backend allows cross-origin requests for the browser client.

## Clone

Use `--recurse-submodules`; a plain clone downloads the superproject but leaves the submodule directories unpopulated.

```sh
git clone --recurse-submodules https://github.com/jxisconfused/MultiAgent-Branch-Work.git
cd MultiAgent-Branch-Work
```

To populate submodules after a plain clone, run `git submodule update --init --recursive`.

## Run Locally

Start each project in its own terminal from the `main` checkout:

```sh
cd backend
bun start
```

```sh
cd frontend
npm install
npm start
```

```sh
cd cli
node cli.js ls
node cli.js add https://example.com
node cli.js open <code>
```

The backend listens on port `3000`; the Angular dev server defaults to `4200`. The CLI uses `http://localhost:3000` unless `SNIP_API` is set.

## Update Workflow

Edit a project inside its submodule folder, then commit and push that branch from there. Next, advance the pinned commit in the superproject:

```sh
cd backend
git add -A
git commit -m "Describe backend change"
git push
cd ..
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push
```

Repeat with `frontend` or `cli` as needed. The project commit and the superproject's pointer update are separate commits.

## Generated Release Bundle

The orphan `bundle` branch is generated output: do not hand-edit it. From a clean
`main` checkout with Node.js, npm, Git, and a Git commit identity configured, run:

```sh
node scripts/build-bundle.mjs
node scripts/build-bundle.mjs --push
```

The script updates `backend`, `frontend`, and `cli` to their configured remote
branch tips, runs `npm install` and a production Angular build, and requires
`frontend/dist/snip-frontend/browser/index.html`. It copies the backend and CLI
unchanged, replaces `bundle/public` with the frontend output, and generates the
runtime and deployment files. It commits generated changes inside `bundle` first,
then commits only the four submodule pointers on `main`. Identical output reports
`nothing to commit` rather than attempting an empty commit. Dirty worktrees or
pre-existing staged changes stop the script; no unrelated files are committed.

Without `--push`, commits remain local. With `--push`, it pushes `HEAD:bundle`
before `HEAD:main`, including any local release commits from an earlier run.
Push source-branch commits before generating, since generation follows remote
tips. In CI, configure the Git author identity and authentication before using
`--push`.

To run the assembled release:

```sh
cd bundle
bun start
node cli.js ls
```

Open `http://localhost:3000` for both the UI and API. Bun loads the generated
`.env` containing `PUBLIC_DIR=./public`; it contains no secrets. The package has
no `"type"` field, preserving the CLI's plain-Node CommonJS behavior.
Production UI builds call the same-origin API; development builds still call
`http://localhost:3000`. As with the development backend, links are in memory.

For Railway, deploy the `bundle` branch at its root. Its `railway.json` selects
the Dockerfile builder, and the Bun Alpine image serves both UI and API.
`.dockerignore` excludes Git metadata, dependencies, and local environment
overrides while retaining the generated `.env`.

## GitHub Actions

**Build bundle** runs hourly at minute 17 (UTC) or through `workflow_dispatch`.
It checks out `main`, uses Node 24, and runs the generator with `--push` as
`github-actions[bot]`. It has no push trigger: source branches do not contain
this workflow, and GitHub reads push workflows from the pushed branch.
Concurrent bundle runs are serialized to avoid competing release pushes.

**Build and push image** runs when a push to `main` changes the `bundle`
submodule pointer or its Docker workflow, or through `workflow_dispatch`.
It builds the pinned bundle with its Dockerfile and publishes
`ghcr.io/jxisconfused/multiagent-branch-work:latest` and
`ghcr.io/jxisconfused/multiagent-branch-work:sha-<short-main-commit>` using
`GITHUB_TOKEN` with package-write permission.

GitHub suppresses push-triggered workflows for commits pushed by `GITHUB_TOKEN`.
Therefore, after pinning a changed bundle, **Build bundle** explicitly dispatches
the Docker workflow on `main` using its additional `actions: write` permission.
No-op bundle runs do not dispatch an image build.