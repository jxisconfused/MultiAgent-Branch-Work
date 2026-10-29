# Snip CLI

A zero-dependency Node.js command-line client for the Snip API. Node 20 or newer is required.

```sh
node cli.js add https://example.com
node cli.js ls
node cli.js open ABC123
```

Set `SNIP_API` to change the backend origin; it defaults to `http://localhost:3000`. Errors are printed to stderr with exit code 1.