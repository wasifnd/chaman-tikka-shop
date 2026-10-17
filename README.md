# BBQ Store

Online ordering for BBQ Store, Lahore: menu, cart, checkout, live order tracking, store/kitchen panel and a lean admin.

## Setup (about 5 minutes)

You need Node 22+ and a free [Neon](https://neon.tech) Postgres database.

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL and the two JWT secrets (DIRECT_URL is optional)
npm run db:setup          # applies migrations and seeds demo data
npm run dev               # http://localhost:3000
```

## Quality gates

Everything below also runs in CI, and `main` is protected so a PR can only merge when all checks pass.

| Command                 | What it checks                                  |
| ----------------------- | ----------------------------------------------- |
| `npm run format:check`  | Prettier                                        |
| `npm run lint`          | ESLint (strict TypeScript, a11y), zero warnings |
| `npm run typecheck`     | `tsc` in strict mode                            |
| `npm run test:coverage` | Vitest, fails under 80% coverage                |
| `npm run build`         | Production build                                |

Run them all before pushing:

```bash
npm run format:check && npm run lint && npm run typecheck && npm run test:coverage
```
