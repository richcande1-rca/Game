# Worker Contract

Gothic Chronicle uses a static frontend plus a Cloudflare Worker image service.

## Frontend

The frontend lives at the repo root and is served by GitHub Pages.

## Worker

The Worker source lives in `worker/` and deploys separately through Wrangler.

## Main image endpoint

```text
GET /image?room=<room>&state=<state>&seed=<seed>&v=<version>&t=<cachebuster>
```

The Worker redirects to a deterministic cached image URL under:

```text
/api/image/<imageId>.jpg
```

## Important query params

- `room`: room/scene name from the game
- `state`: serialized game flags and milestones
- `seed`: deterministic seed input
- `v`: prompt/cache version
- `t`: optional frontend cache-busting value

## Response behavior

- `/health` returns JSON status.
- `/image` validates the room and redirects to `/api/image/<imageId>.jpg`.
- `/api/image/<imageId>.jpg` returns `image/jpeg` when generation succeeds.
- `debug=1` returns the generated prompt/debug JSON instead of an image.

## Coupling notes

The frontend and Worker must stay in sync on room names, state flags, milestones, prompt versioning, and expected image URL params.
