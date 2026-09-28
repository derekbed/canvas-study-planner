# Coursewise web app

This is the working student interface and server for the Coursewise preview.

## Local development

Use Node.js 22.13 or newer and pnpm:

```sh
pnpm install
pnpm db:generate
pnpm build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_natural_alice.sql
pnpm dev
```

Apply each new migration only once to a local preview database. The app uses a local sample student when served from localhost; deployed requests require a signed-in Site user.

## Server configuration

See [.env.example](./.env.example). The Canvas callback URL is `https://<site-host>/api/canvas/callback`. A configured school developer key and token encryption key enable Canvas OAuth. An OpenAI API key enables study chat and generated flashcards and quizzes. Keep credentials in server secrets, never in client code or Git.

## Storage

Course data, assignments, plan blocks, and indexed text use D1. Uploaded file bytes use R2. Uploaded PDFs are parsed in the student's browser before the extracted text is saved with the file. Text from scanned pages will not be indexed without OCR.
