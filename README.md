# Snip: One API, Two Clients

Snip is a tiny URL shortener with one Bun backend and two clients: an Angular web app and a zero-dependency Node CLI. The web app and terminal client use the same API and see the same in-memory links.

## Repository Layout

Each project lives on its own orphan branch with files at that branch's root. The `main` branch composes them as submodules, pinning each folder to a specific commit:

```text
snip-demo/
├── backend/    Bun API and short-code redirects  (branch: backend)
├── frontend/   Angular 19 web client             (branch: frontend)
├── cli/        Node.js command-line client       (branch: cli)
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