import * as dotenv from "dotenv";
dotenv.config();
import express from "express";

import { UsernameGenerator } from "./controllers/usernames.controller";
import { usernameReqValidator } from "./validators/username-req.validator";

export const app = express();
app.use(express.json());


const usernameGenerator = new UsernameGenerator();


app.post("/usernames", usernameReqValidator, usernameGenerator.generateUsernameHandler);




