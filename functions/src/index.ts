import { defineSecret } from "firebase-functions/params";
import { createApp, createAppDev } from "./server";
import { onRequest } from "firebase-functions/v2/https";

import { initializeApp } from "firebase-admin/app";

// Initialize Firebase
export const firebaseAdminApp = initializeApp();

export const apiKey = defineSecret("MW_THESAURUS_API");

export const usernameGeneratorAPIGen2 = onRequest(
  {
    minInstances: 1,
    concurrency: 10,
    secrets: [apiKey],
  },
  createApp(),
);

export const usernameGeneratorAPIGen2Dev = onRequest(
  {
    minInstances: 1,
    concurrency: 10,
    secrets: [apiKey],
  },
  createAppDev(),
);
