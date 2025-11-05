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
  try {
    const bearerToken = req.headers.authorization?.trim().split(" ");

    if (bearerToken) {
      // debug(bearerToken[1]);
      await getAuth().verifyIdToken(bearerToken[1]);
      debug(`Token verified!`);
      next();
    } else {
      return next(new Error("Missing Header"));
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
  // debug(req);
  const appCheckToken = req.header("X-Firebase-AppCheck");
  // debug(appCheckToken);
  // const appCheckDebugToken = req.header('X-Firebase-AppCheck');
  const tokenToCheck = appCheckToken; //? appCheckToken : appCheckDebugToken;
  if (!tokenToCheck) {
    res.status(401);
    return next(new Error("Unauthorized Code: No Token"));
  }

  // debug({ tokenToCheck });

  try {
    // if (appCheckToken) {

    await getAppCheck().verifyToken(tokenToCheck);
    // debug(ressy);
    // } else {
    //    return next('');
    // }

    // if (appCheckDebugToken && !appCheckToken) {
    //   debug('DEBUG TOKEN USED');
    // }
    next();
  } catch (err: unknown) {
    res.status(401);
    let msg: string;
    if (err && typeof err === "object" && "message" in err) {
      msg = (err as { message?: unknown }).message as string;
    } else {
      msg = String(err);
    }
    error(msg);
    return next(new Error(`Unauthorized Code: Error ${msg}`));
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

  error(err.stack);
  res.status(res.statusCode !== 200 ? res.statusCode : 500).json({
    name: err.name,
    code: res.statusCode,
    description: err.message ? err.message : err,
    stack: err.stack,
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
