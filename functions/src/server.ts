import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { UsernameGenerator } from "./controllers/usernames.controller";
import { usernameReqValidator } from "./validators/username-req.validator";
import { setupMiddleware } from "./middleware/general.middleware";
import { authRouter } from "./middleware/auth.middleware";

const app = express();
app.use(express.json());
app.use(cors({ origin: true }));
// Mount auth routes on the exported app so the emulator-exposed app includes /auth
app.use("/auth", authRouter);

// Note: username generator route is attached inside `createApp`

// Create Express app for v4
export const createApp = (): express.Express => {
  const app = express();
  setupMiddleware(app); // Apply shared middleware
  // Mount auth routes under /auth so /auth/token is reachable
  app.use("/auth", authRouter);
  // Attach username generator route at runtime to avoid module-load side effects
  const usernameGenerator = new UsernameGenerator();
  app.post(
    "/usernames",
    usernameReqValidator,
    usernameGenerator.generateUsernameHandler,
  );
  // setupSecretRoutes(devApp, app.get('env'));
  app.use("/api/v4"); // Mount v4 routes
  app.use((req, res) => {
    res.status(404).send("404: Sorry can't find that!");
  });
  return app;
};

export const createAppDev = (): express.Express => {
  const app = express();
  setupMiddleware(app); // Apply shared middleware
  // Mount auth routes under /auth so /auth/token is reachable
  app.use("/auth", authRouter);
  // Attach username generator route at runtime to avoid module-load side effects
  const usernameGenerator = new UsernameGenerator();
  app.post(
    "/usernames",
    usernameReqValidator,
    usernameGenerator.generateUsernameHandler,
  );
  // setupSecretRoutes(devApp, app.get('env'));
  app.use("/api/v4"); // Mount v4 routes
  app.use((req, res) => {
    res.status(404).send("404: Sorry can't find that!");
  });
  return app;
};
