import axios from "axios";
import * as logger from "firebase-functions/logger";
import { UsernameGenerator } from "../usernames.controller";

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe("UsernameGenerator", () => {
  test("normalizeSpecialCharacters keeps safe fragments and drops unsafe values", () => {
    const gen = new UsernameGenerator();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (gen as any)["normalizeSpecialCharacters"].bind(gen);
    const specials = fn([
      "_",
      "!",
      "42",
      " user-name ",
      "<script>",
      "\"",
      "/",
      "",
      "   ",
      1,
      null,
    ]) as string[];

    expect(specials).toEqual(["_", "!", "42", "user-name"]);
  });

  test("generateUsernames produces unique usernames and respects max length filter indirectly", () => {
    const gen = new UsernameGenerator();
    // small dataset to make deterministic-ish outputs
    const responseData = ["alpha", "beta", "gamma", "delta"];
    const specials = ["_", "."];

    // access the private method via bracket to avoid TS errors; result is string[]
    // access the private method via bracket to avoid TS errors; allow single-line any here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (gen as any)["generateUsernames"].bind(gen);
    const usernames = fn(responseData, specials) as string[];

    expect(Array.isArray(usernames)).toBe(true);
    // expect non-empty
    expect(usernames.length).toBeGreaterThan(0);
    // expect uniqueness
    const unique = new Set(usernames);
    expect(unique.size).toBe(usernames.length);
    // All usernames are strings
    expect(usernames.every((u: string) => typeof u === "string")).toBe(true);
  });

  test("thesaurus failures log only allowlisted metadata", async () => {
    const requestError = Object.assign(new Error("request failed"), {
      config: {url: "https://example.test/?key=sentinel-secret"},
    });
    const axiosGet = jest.spyOn(axios, "get").mockRejectedValueOnce(requestError);
    const logError = logger.error as jest.Mock;
    logError.mockClear();

    try {
      const gen = new UsernameGenerator();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (gen as any)["getWordsFromResponse"].bind(gen);
      await fn(["alpha"]);

      expect(logError).toHaveBeenCalledWith("thesaurus_lookup_failed", {
        provider: "merriam-webster",
        status: "unknown",
        code: "UPSTREAM_REQUEST_FAILED",
      });
      expect(JSON.stringify(logError.mock.calls)).not.toContain("sentinel-secret");
    } finally {
      axiosGet.mockRestore();
    }
  });
});
