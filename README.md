# Snip Backend

A zero-dependency Bun API for creating and redirecting short links. Links are kept in memory and are cleared when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL` to set the origin used in generated short links, or `RAILWAY_PUBLIC_DOMAIN` to use `https://<domain>` when `BASE_URL` is unset. `BASE_URL` takes precedence.

Set `PUBLIC_DIR` to also serve static files from a directory. `/` serves its `index.html`; existing files are checked before short-code redirects.

## API

- `POST /api/links` with `{ "url": "https://example.com" }` creates a link.
- `GET /api/links` lists links and hit counts.
- `GET /:code` redirects to the original URL and increments its hit count.

The API accepts HTTP and HTTPS URLs and allows cross-origin requests.