# Username Generator

An App Check-protected Firebase Functions API that turns short prompts into themed username suggestions. The service powers the `lib-username-generator` widget that ships with Everything App and the published `@zwiqler94/everything-lib` package.

## Architecture

| Path | Purpose |
| ---- | ------- |
| `functions/` | Cloud Functions v2 HTTP API (Express) that exposes `POST /api/v4/usernames` and the authenticated `GET /auth/token` helper. |
| `username-generator/` | Secondary Cloud Functions v2 codebase that hosts the callable `unGenCallable` helper. Clients call it to mint Firebase App Check tokens before hitting the API. |
| `firebase.json` | Declares both codebases and their build hooks. Deploying with `firebase deploy --only functions` publishes every function listed here. |
| `credentials/`, `public/` | Local-only assets or hosting stubs that are ignored by deploys. |

Both codebases target Node.js 22 and compile TypeScript into the `lib/` folders that Firebase uploads. The HTTP API is a conventional Express app wired through `createApp()`/`createAppDev()`, while the callable function simply proxies `getAppCheck().createToken()` for the Everything App Firebase project (`appId: 1:853416854561:web:ce4ad92e0ba115925e8f60`).

## Getting started

### 1. Install dependencies

```bash
npm install --prefix functions
npm install --prefix username-generator
```

If you plan to run the conventional-changelog tooling from the repo root, also run `npm install` at the workspace root.

### 2. Configure Firebase & secrets

1. Log in and select the target project:

   ```bash
   firebase login
   firebase use <your-project-id>
   ```

2. Store your Merriam-Webster key as a runtime secret so Cloud Functions can read it through `defineSecret`:

   ```bash
   firebase functions:secrets:set MW_THESAURUS_API=your-api-key
   ```

3. For local emulators, create `functions/.env` with the same value:

   ```
   MW_THESAURUS_API=your-api-key
   ```

4. Ensure the Firebase project has App Check enabled for the Everything App web client and that you have a valid reCAPTCHA v3/Enterprise site key configured in that frontend. App Check tokens generated for other app IDs will be rejected.

### 3. Run locally

```bash
npm run build --prefix username-generator   # compile the callable once
npm run serve --prefix functions            # build + firebase emulators:start --only functions
```

The emulator respects the multi-codebase config in `firebase.json`, so both the HTTP API and callable function load at once. When running the Everything App against the emulator, set `FIREBASE_APPCHECK_DEBUG_TOKEN=1` in the browser console or environment to use debug App Check tokens.

### 4. Deploy

```bash
npm run build --prefix functions
npm run build --prefix username-generator
firebase deploy --only functions
```

Use `firebase deploy --only "functions:usernameGeneratorAPIGen2,functions:usernameGeneratorAPIGen2Dev"` to redeploy only the HTTP endpoints, or `firebase deploy --only functions:unGenCallable` to refresh the callable helper.

### 5. Useful scripts

| Command | Where to run | Description |
| ------- | ------------ | ----------- |
| `npm run lint` | `functions/` | Runs ESLint via `gts` config across the API source. |
| `npm test` | `functions/` | Executes Jest-based unit tests. |
| `npm run build:watch` | `functions/` or `username-generator/` | Incremental TypeScript builds during development. |
| `npm run logs` | `functions/` | Streams recent Cloud Functions logs. |
| `npm run deploy` | `functions/` or `username-generator/` | Deploys the current codebase; from `functions/` it deploys all HTTP endpoints, from `username-generator/` it deploys `unGenCallable`. |

## API reference

### Base URLs

| Environment | Username API | Callable helper |
| ----------- | ------------ | ---------------- |
| Production | `https://usernamegeneratorapigen2-e2kmmtsfeq-uc.a.run.app` | `https://us-central1-usernamegenerator.cloudfunctions.net/unGenCallable` |
| Development | `https://usernamegeneratorapigen2dev-e2kmmtsfeq-uc.a.run.app` | Emulator host or the staging Cloud Function, depending on your Firebase target |

The Angular client automatically switches between the dev/prod hosts via `isDevMode()`. When using the emulator, the callable URL changes to `http://127.0.0.1:5001/<project-id>/us-central1/unGenCallable` (shown in emulator output).

### `POST /api/v4/usernames`

Generates up to ~300 deterministic handles by blending Merriam-Webster synonyms, the supplied prompt words, and optional special characters.

- **Headers**
  - `Content-Type: application/json`
  - `X-Firebase-AppCheck: <token>` - required. Issued by `unGenCallable` or `/auth/token`.
- **Query params**
  - `maxlength` (optional): truncate any usernames longer than this value (default `20`).
- **Body**

  ```json
  {
    "words": ["orbit", "nebula"],
    "specials": ["_", "!", "42"]
  }
  ```

  `words` must be a non-empty array. `specials` is optional; pass an empty array or omit it entirely to skip symbols/numbers.
- **Responses**
  - `200 OK` with a JSON array (`string[]`) of unique usernames, e.g.:

    ```json
    [
      "Orbit!Nebula31",
      "Nebula_42Signal",
      "PhotonOrbit"
    ]
    ```

  - `400 Bad Request` when validation fails (`words` missing/invalid). The payload contains the express-validator error list.
  - `401 Unauthorized` when the App Check token is missing or invalid.

Internally, the handler caches up to 1,000 thesaurus lookups for one hour, filters profanity via `badWords`, rate-limits to 100 requests per IP per 15 minutes, and sends Helmet/CORS headers by default.

### `GET /auth/token`

Issues a short-lived Firebase App Check token for the Everything App web app.

- **Headers**
  - `Authorization: Bearer <Firebase ID token>` - verified via `getAuth().verifyIdToken`. Obtain this token the same way you would for any Firebase-authenticated user session.
- **Responses**
  - `201 Created` with `{ "token": "<AppCheck token>" }`.
  - `401 Unauthorized` when the bearer token is missing/invalid.

This endpoint is available both on the deployed host and in the emulator at `/auth/token`. Because it doubles as an authenticated utility route, it is mounted under `/api/v4/auth/token` inside the main Express router.

### Callable: `unGenCallable`

```ts
export const unGenCallable = onCall({ enforceAppCheck: true }, async () => {
  const appToken = await getAppCheck().createToken(
    "1:853416854561:web:ce4ad92e0ba115925e8f60"
  );
  return appToken;
});
```

- Deploys from the `username-generator/` codebase.
- Enforces App Check on invocation, so only verified clients (or emulator debug tokens) can call it.
- Returns the same token structure consumed by the Angular client. Typical usage:

  ```ts
  const callable = httpsCallable(functions, 'unGenCallable');
  const { data } = await callable();
  http.post('/api/v4/usernames', body, {
    headers: { 'X-Firebase-AppCheck': data.token }
  });
  ```

## Security model

- **App Check everywhere**: Both the callable and the HTTP API require App Check tokens before fulfilling requests.
- **Firebase Auth guard**: `/auth/token` verifies the caller's Firebase ID token.
- **Rate limiting**: `express-rate-limit` caps bursts at 100 requests per 15-minute window per IP.
- **Helmet + CORS**: standard security headers and CORS configuration are applied by `setupMiddleware`.
- **Profanity filter**: all prompt words are normalized and vetted against `badWords`, and default safe words fill any gaps.

## Testing & linting

```bash
npm test --prefix functions              # Jest tests (passWithNoTests by default)
npm run lint --prefix functions          # ESLint via gts preset
npm run lint --prefix username-generator # TypeScript ESLint for callable code
```

Add new unit tests under `functions/src/**/__tests__` and keep auto-generated `lib/` artifacts out of version control.

## Troubleshooting

- **Missing MW_THESAURUS_API**: requests fail with 500/`MW_THESAURUS_API not available`. Confirm the secret exists (`firebase functions:secrets:access`) or that `.env` is populated when running locally.
- **401 from `/api/v4/usernames`**: most often caused by absent `X-Firebase-AppCheck` header or by using a token for another Firebase app ID. Regenerate the token via `unGenCallable`.
- **429 Too Many Requests**: the rate limiter kicked in. Wait for 15 minutes or lower the request volume in load tests.
- **Callable errors in dev**: set `FIREBASE_APPCHECK_DEBUG_TOKEN=1` before loading the Everything App so Firebase injects the debug App Check token.

## License

Released under the ISC License. See `LICENSE` for the full text.
