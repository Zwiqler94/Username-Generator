import * as dotenv from "dotenv";
dotenv.config();
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { UsernameGenerator } from "./controllers/usernames.controller";
import { usernameReqValidator } from "./validators/username-req.validator";

export const app = express();
app.use(express.json());
app.use(cors({ origin: true }));
app.use((req: Request, res: Response, next: NextFunction) => {
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "3600");
  }
});

const usernameGenerator = new UsernameGenerator();

app.post(
  "/usernames",
  usernameReqValidator,
  usernameGenerator.generateUsernameHandler
);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).send("404 Not Found");
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send("500 ERROR");
});
