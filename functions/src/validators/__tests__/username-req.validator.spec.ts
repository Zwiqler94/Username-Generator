import {Request} from "express";
import {validationResult} from "express-validator";
import {
  MAX_WORDS,
  usernameReqValidator,
} from "../username-req.validator";

async function validate(body: unknown) {
  const req = {body} as Request;
  await Promise.all(usernameReqValidator.map((validator) => validator.run(req)));
  return validationResult(req);
}

describe("usernameReqValidator", () => {
  test("rejects oversized word arrays", async () => {
    const result = await validate({
      words: Array.from({length: MAX_WORDS + 1}, () => "alpha"),
    });

    expect(result.isEmpty()).toBe(false);
  });

  test("accepts bounded words and specials", async () => {
    const result = await validate({
      words: ["alpha", "beta"],
      specials: ["_", "42"],
    });

    expect(result.isEmpty()).toBe(true);
  });
});
