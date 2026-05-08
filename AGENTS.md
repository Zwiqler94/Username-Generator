# AGENTS.md

These instructions apply to the full `Username-Generator` repository unless a
more specific `AGENTS.md` is added in a subdirectory.

## Repo Shape

- Firebase multi-codebase project.
- `functions/` owns the primary Express HTTP API.
- `username-generator/` owns the secondary callable function codebase.
- `firebase.json` controls deployment and predeploy checks for both codebases.
- The main in-workspace consumers are `everything-lib` and `jz-portfolio`.

## Prime Directives

- Make surgical, minimal diffs in the API ownership layer.
- Treat route paths, request bodies, response shapes, headers, App Check
  behavior, and callable names as public contracts.
- Before changing `POST /api/v4/usernames`, `/auth/token`,
  `/api/v4/auth/token`, or `unGenCallable`, search sibling consumers with `rg`.
- Keep generated output and local tooling artifacts out of review and edits:
  `lib/`, `node_modules/`, `.scannerwork/`, `.firebase/`, emulator logs, and
  `.DS_Store`.
- Do not run mutating lint or formatter commands during read-only work.

## Security And Secrets

- Never print, copy, or persist secrets. If a secret is found, report only the
  path and line and recommend rotation.
- Treat `credentials/`, `.env*`, Firebase service-account files, OAuth client
  secrets, and local emulator credentials as sensitive.
- `MW_THESAURUS_API` belongs in Firebase Secret Manager or local ignored env
  files, not tracked source.
- App Check is abuse protection, not user authorization. Keep it separate from
  Firebase Auth and do not use it as a user identity check.
- Avoid logging tokens, raw credentials, full request bodies, or upstream API
  secrets.

## Coding Standards

- Use TypeScript strict mode and Node 22.
- `functions/` uses flat ESLint, GTS/Prettier style, double quotes, semicolons,
  and Firebase Functions v2.
- `username-generator/` still uses legacy ESLint with Google style. Preserve
  local style unless explicitly modernizing lint config.
- Keep Express middleware small and ordered intentionally: parsing, CORS,
  security headers, rate limiting, App Check/Auth, validation, controller.
- Validate request bodies before controller work. Prefer typed request and
  response models over `any`.
- Keep external API calls bounded, sanitized, and cache-aware.

## API Contract Notes

- `POST /api/v4/usernames` expects `{ "words": string[], "specials"?: string[] }`
  and optional `?maxlength=<n>`.
- Username generation requires `X-Firebase-AppCheck` on protected API routes.
- `unGenCallable` is an App Check-enforced callable used by Angular clients to
  obtain an App Check token for the username app.
- Keep README, validators, controller responses, and Angular client expectations
  aligned when any API contract changes.

## Known Drift / Do Not Copy

- The README describes a JSON array response, while the controller currently
  sends with `contentType("text/plain")`.
- The README says `words` must be non-empty, but the validator only checks that
  `words` exists and is an array.
- `createApp()` and `createAppDev()` duplicate most server setup.
- `functions/package.json` has `lint: eslint --fix ./`, which mutates files.
  Treat that as a fix command, not a read-only check.

## Validation

Use Node 22:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
```

Non-mutating checks:

```bash
npm run build --prefix functions
npm test --prefix functions
npm run build --prefix username-generator
npm run lint --prefix username-generator
```

Mutating check, run only when edits are intended:

```bash
npm run lint --prefix functions
```

If using emulators, document required secrets/debug App Check setup and do not
commit emulator-generated state.

## Follow-Up Backlog

- Align controller content type with the documented JSON response.
- Strengthen request validation for non-empty `words`.
- Deduplicate `createApp()` and `createAppDev()`.
- Split mutating `functions` lint from a read-only lint command.
