import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { UsernameGenerator } from "./controllers/usernames.controller";
import { usernameReqValidator } from "./validators/username-req.validator";
import { setupMiddleware } from "./middleware/general.middleware";
import { authRouter } from "./middleware/auth.middleware";

// Note: username generator route is attached inside `createApp`

// Create Express app for v4
export const createApp = (): express.Express => {
  const app = express();
  app.disable("x-powered-by");

  app.use(express.json());
  app.use(cors({ origin: true }));
  // Mount auth routes on the exported app so the emulator-exposed app includes /auth
  app.use("/auth", authRouter);

  // Trust Proxy (needed so rateLimit can see correct client IPs behind proxies)
  app.set("trust proxy", 1);
  // Disable 'X-Powered-By' header
  app.set("X-Powered-By", false);

  const middlewareRouter = setupMiddleware(); // Apply shared middleware
  // Mount auth routes under /auth so /auth/token is reachable
  middlewareRouter.use("/auth", authRouter);
  // Attach username generator route at runtime to avoid module-load side effects
  const usernameGenerator = new UsernameGenerator();
  middlewareRouter.post(
    "/usernames",
    usernameReqValidator,
    usernameGenerator.generateUsernameHandler,
  );
  // setupSecretRoutes(devApp, app.get('env'));
  app.use("/api/v4", middlewareRouter); // Mount v4 routes
  app.use((req, res) => {
    res.status(404).send("404: Sorry can't find that!");
  });
  return app;
};

export const createAppDev = (): express.Express => {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: true }));
  // Mount auth routes on the exported app so the emulator-exposed app includes /auth
  app.use("/auth", authRouter);

  // Trust Proxy (needed so rateLimit can see correct client IPs behind proxies)
  app.set("trust proxy", 1);
  // Disable 'X-Powered-By' header
  app.set("X-Powered-By", false);

  const middlewareRouter = setupMiddleware(); // Apply shared middleware
  // Mount auth routes under /auth so /auth/token is reachable
  middlewareRouter.use("/auth", authRouter);
  // Attach username generator route at runtime to avoid module-load side effects
  const usernameGenerator = new UsernameGenerator();
  middlewareRouter.post(
    "/usernames",
    usernameReqValidator,
    usernameGenerator.generateUsernameHandler,
  );
  // setupSecretRoutes(devApp, app.get('env'));
  app.use("/api/v4", middlewareRouter); // Mount v4 routes
  app.use((req, res) => {
    res.status(404).send("404: Sorry can't find that!");
  });
  return app;
};
