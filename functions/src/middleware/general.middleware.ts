import { getAppCheck } from "firebase-admin/app-check";

import {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
  Express,
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
      debug(bearerToken[1]);
      const decodedToken = await getAuth().verifyIdToken(bearerToken[1]);
      debug(`${decodedToken.uid}'s token verified!`);
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
  const appCheckToken = req.header("X-Firebase-AppCheck");
  // const appCheckDebugToken = req.header('X-Firebase-AppCheck');
  const tokenToCheck = appCheckToken; //? appCheckToken : appCheckDebugToken;
  if (!tokenToCheck) {
    res.status(401);
    return next("Unauthorized Code: No Token");
  }

  // debug({ tokenToCheck });

  try {
    // if (appCheckToken) {

    await getAppCheck().verifyToken(tokenToCheck);

    // } else {
    //    return next('');
    // }

    // if (appCheckDebugToken && !appCheckToken) {
    //   debug('DEBUG TOKEN USED');
    // }
    next();
  } catch (err: unknown) {
    // error(err);
    res.status(401);
    let msg: string;
    if (err && typeof err === "object" && "message" in err) {
      msg = (err as { message?: unknown }).message as string;
    } else {
      msg = String(err);
    }
    return next(`Unauthorized Code: Error ${msg}`);
  }
  // next();
};

// allowList was removed because it was unused; keep here as a reference if needed in future

export const limiter = rateLimit({
  max: 100,
  windowMs: 15 * 60 * 1000,
  // Don't include invalid options; use booleans for headers config
  legacyHeaders: false,
  standardHeaders: true,
  // skip: (req, res) => allowList.includes(req.ip as string),
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
) => {
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

export const setupMiddleware = (app: Express): void => {
  // CORS
  app.use(cors(corsOpts));

  // Security headers
  app.use(helmet());

  // Compression
  app.use(compression());

  // Trust Proxy (needed so rateLimit can see correct client IPs behind proxies)
  app.set("trust proxy", 1);

  // Rate Limiting
  app.use(limiter);

  // Disable 'X-Powered-By' header
  app.set("X-Powered-By", false);

  // App Check Guard Middleware
  app.use(appCheckGaurd);

  // Error Handler Middleware
  app.use(errorHandler);
};
