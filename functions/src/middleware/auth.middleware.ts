import express, { NextFunction, Request, Response } from "express";
import { getAppCheck } from "firebase-admin/app-check";
import { error } from "firebase-functions/logger";
import { authValidator } from "../validators/auth.validator";
import { authGuard } from "./general.middleware";

export const authRouter = express.Router();

const tokenGenerator = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const appToken = await getAppCheck().createToken(
      "1:853416854561:web:ce4ad92e0ba115925e8f60",
    );
    res.status(201).json({ token: appToken.token });
  } catch (err) {
    error(err);
    res.status(500).json({ error: "Internal server error" });
    next(err);
  }
};

authRouter.get("/token", authValidator, authGuard, tokenGenerator); //basicAuth({ authorizer }), tokenGenerator);
