import {app as api} from "../../src/server";
import {NextFunction, Request, Response} from "express";
import * as functions from "firebase-functions";
import cors from "cors";

// // Start writing functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

api.use(cors({origin: true}));
api.use((req: Request, res: Response, next: NextFunction) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "3600");
  }
});

export const usernameGeneratorAPI = functions.https
// .runWith({enforceAppCheck: true})
    .onRequest(api);
