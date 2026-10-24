# Contributing to Settlix Oracle

## Setup

```bash
git clone https://github.com/<you>/settlix-oracle.git
cd settlix-oracle
npm install
npm test
```

Node 20.11 or newer (`.nvmrc` pins 22).

## Already have a fork?

Sync it before you start; older forks predate the current code:

```bash
gh repo sync <you>/settlix-oracle --source SETTLIX/settlix-oracle --branch main
```

## Workflow

1. Open or claim an issue for anything beyond a typo.
2. Branch from `main`: `feat/<name>`, `fix/<name>`, `docs/<name>`.
3. Use [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(prices): ...`, `fix(verify): ...`.
4. Run `npm run typecheck && npm test`. CI runs the same on Node 20 and 22,
   and builds the Docker image.
5. Open a pull request that fills in the template and links the issue with
   `Closes #N`.

## Guidelines

- **No floats for money.** Use the helpers in `src/money.ts`.
- **No fallbacks that invent data.** If a source is down, say so with a
  503. Do not substitute a default.
- **Inject, don't import, I/O.** Price sources, Horizon and the chain
  reader are passed in so tests stay offline. New I/O should follow suit.
- **Validate at the edge** with zod, and keep error responses in the shared
  `{ error, message, details }` shape.
- **Test the failure paths.** Every check that can fail needs a test that
  makes it fail.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
