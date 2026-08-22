import { getAppCheck } from "firebase-admin/app-check";

import {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
  Router,
} from "express";
import { debug, error } from "firebase-functions/logger";
import rateLimit from "express-rate-limit";
import { validationResult } from "express-validator";
// import basicAuth from 'express-basic-auth';
import { getAuth } from "firebase-admin/auth";
import compression from "compression";
import cors, { CorsOptions } from "cors";
import helmet from "helmet";

// export const basicAuthorizer = (user: any, password: any) => {
//   const userMatch = basicAuth.safeCompare(user, process.env.ADMIN_USER!);
//   const passMatch = basicAuth.safeCompare(password, process.env.ADMIN_PASS!);
//   return userMatch && passMatch;
// };

export const authGuard = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { authorization } = req.headers;
  const [scheme, token] = authorization
    ? authorization.trim().split(" ")
    : ["", ""];

  try {
    if (scheme === "Bearer" && token.trim().length > 1) {
      await getAuth().verifyIdToken(token);
      debug("Token verified!");
      next();
    } else {
      res.status(401);
      return next(new Error("Unauthorized"));
    }
  } catch (err) {
    res.status(401);
    return next(err);
  }
};

export const appCheckGaurd = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const appCheckToken = req.header("X-Firebase-AppCheck");
  const tokenToCheck = appCheckToken;
  if (!tokenToCheck) {
    res.status(401);
    return next(new Error("Unauthorized"));
  }
  try {
    await getAppCheck().verifyToken(tokenToCheck);
    next();
  } catch (err: unknown) {
    res.status(401);
    error("app_check_verification_failed", {
      error: err instanceof Error ? err.name : "UnknownError",
    });
    return next(new Error("Unauthorized"));
  }
};

export const limiter = rateLimit({
  max: 100,
  windowMs: 15 * 60 * 1000,
  legacyHeaders: false,
  standardHeaders: true,
});

export const validator = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  } else {
    error(result.array);
    res.status(400).json({ errors: result.array() });
  }
};

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = res.statusCode !== 200 ? res.statusCode : 500;
  error("request_failed", { code: status, name: err.name });
  res.status(status).json({
    name: status === 401 ? "UnauthorizedError" : err.name,
    code: status,
    description:
      status === 401
        ? "Unauthorized"
        : status >= 500
          ? "Internal Server Error"
          : err.message || "Request failed",
  });
};

const corsOpts: CorsOptions = {
  origin: ["http://localhost"],
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  exposedHeaders: ["X-Ratelimit-Limit", "Set-Cookie"],
  allowedHeaders: [
    "Set-Cookie",
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],
  credentials: true,
};

export const setupMiddleware = (): Router => {
  const router = Router();

  // CORS
  router.use(cors(corsOpts));

  // Security headers
  router.use(helmet());

  // Compression
  router.use(compression());

  // Rate Limiting
  router.use(limiter);

  // App Check Guard Middleware
  router.use(appCheckGaurd);

  // Error Handler Middleware
  router.use(errorHandler);

  return router;
};
