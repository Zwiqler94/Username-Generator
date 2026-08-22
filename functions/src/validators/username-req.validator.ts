import { body, ValidationChain } from "express-validator";

export const MAX_WORDS = 20;
export const MAX_SPECIALS = 10;
export const MAX_WORD_LENGTH = 30;
export const MAX_SPECIAL_LENGTH = 12;

export const usernameReqValidator: ValidationChain[] = [
  body("words")
    .exists()
    .isArray({ min: 1, max: MAX_WORDS })
    .custom((words: unknown[]) =>
      words.every(
        (word) =>
          typeof word === "string" &&
          word.trim().length >= 2 &&
          word.trim().length <= MAX_WORD_LENGTH,
      ),
    ),
  body("specials")
    .optional()
    .isArray({ max: MAX_SPECIALS })
    .custom((specials: unknown[]) =>
      specials.every(
        (special) =>
          typeof special === "string" &&
          special.trim().length <= MAX_SPECIAL_LENGTH &&
          /^[A-Za-z0-9_.!@#$-]+$/.test(special.trim()),
      ),
    ),
];
