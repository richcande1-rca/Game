# Gothic Chronicle Image Worker

This folder contains the Cloudflare Worker used by the Gothic Chronicle frontend to generate and cache scene images.

The Worker source lives here so Codex and future development work can inspect the game frontend and image-generation backend in one workspace.

## Local development

```bash
cd worker
npm install
npm run dev
```

## Deploy

```bash
cd worker
npm run deploy
```

Runtime Cloudflare bindings should remain configured through Cloudflare/Wrangler rather than being hard-coded in source.
