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

## Database tests

Most tests need no database. A few (pricing and order placement) run against real Postgres to prove
things like "two simultaneous orders never get the same number". They are skipped unless you set a URL:

```bash
INTEGRATION_DATABASE_URL="postgresql://..." npm test
```

They create a private, temporary schema from the real migrations and delete it afterwards, so they never
touch your data, even on your development database. CI runs them against a throwaway Postgres container.

## Store panel

Staff sign in at `/auth/login` and land on `/store/orders` (the order board). `/store/kitchen` is a
simplified screen for the kitchen: only what has to be cooked, with one big button per ticket.

`npm run db:seed` creates two demo accounts for local development: `staff@bbqstore.local` (store staff)
and `admin@bbqstore.local`. Their password is `SEED_DEMO_PASSWORD` if set, otherwise a default written in
`prisma/seed.ts`. **Change it, or delete these accounts, before going live.**

## Admin panel

Sign in as an admin and open `/admin`. From there the owner can edit categories, menu items (with options such as portion size, and add-ons), deals, delivery areas, coupons, opening hours, tax, and the team's accounts, and search every order ever placed. Changes reach customers at once. Photos are Cloudinary addresses; set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` to enable the Upload button (optional).

## End-to-end scenarios

`npm run e2e` drives a running site over HTTP as a guest, a customer, store staff and an admin (about 250 checks: ordering, kitchen flow, live feed, menu and settings changes, team management, security). No browser is needed. Start the site first (`npm run build && npm start`), then:

```bash
E2E_BASE_URL=http://localhost:3000 npm run e2e
```

They create their own menu items and put everything back afterwards. Use a development or CI database, never production.
