import { body, ValidationChain } from "express-validator";

export const usernameReqValidator: ValidationChain[] = [
  body("words").exists().isArray(),
  body("specials").optional().isArray(),
];
