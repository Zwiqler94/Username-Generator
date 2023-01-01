import * as dotenv from "dotenv";
dotenv.config();
import express, { Request, Response, NextFunction } from "express";

import { UsernameGenerator } from "./controllers/usernames.controller";
import { usernameReqValidator } from "./validators/username-req.validator";

export const app = express();
app.use(express.json());

const usernameGenerator = new UsernameGenerator();

app.post(
  "/usernames",
  usernameReqValidator,
  usernameGenerator.generateUsernameHandler
);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(404).send("404 Not Found");
});
