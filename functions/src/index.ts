import {defineSecret} from "firebase-functions/params";
import {app as api} from "../../src/server";
import {onRequest} from "firebase-functions/v2/https";

// // Start writing functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const apiKey = defineSecret("MW_THESAURUS_API");

export const usernameGeneratorAPIGen2 = onRequest(
    {
      concurrency: 10,
      secrets: [apiKey],
    },
    api
);
