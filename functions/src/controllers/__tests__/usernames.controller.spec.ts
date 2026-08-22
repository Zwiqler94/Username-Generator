import axios from "axios";
import * as logger from "firebase-functions/logger";
import { UsernameGenerator } from "../usernames.controller";

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe("UsernameGenerator", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    (logger.error as jest.Mock).mockReset();
  });

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
    expect(usernames.length).toBeLessThanOrEqual(500);
  });

  test("normalizes and bounds special-character fragments", () => {
    const gen = new UsernameGenerator();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (gen as any)["normalizeSpecialCharacters"].bind(gen);
    const specials = fn(["_", "_", "a".repeat(13), ...Array(20).fill("!")]);

    expect(specials).toEqual(["_", "!"]);
  });

  test("bounds thesaurus requests and applies an Axios timeout", async () => {
    const axiosGet = jest
      .spyOn(axios, "get")
      .mockResolvedValue({data: []} as never);
    const gen = new UsernameGenerator();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (gen as any)["getWordsFromResponse"](
      Array.from({length: 40}, (_, index) => `word${index}`),
    );

    expect(axiosGet).toHaveBeenCalledTimes(25);
    expect(axiosGet.mock.calls[0][1]).toEqual({
      timeout: 5000,
      maxContentLength: 64 * 1024,
      maxBodyLength: 64 * 1024,
    });
  });

  test("does not log credential-bearing Axios error details", async () => {
    const sentinel = "https://example.test/?key=sentinel-secret";
    const requestError = Object.assign(new Error("upstream failure"), {
      config: {url: sentinel},
      code: "ERR_NETWORK",
      isAxiosError: true,
      response: {status: 503},
    });
    jest.spyOn(axios, "get").mockRejectedValueOnce(requestError);
    const gen = new UsernameGenerator();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (gen as any)["getWordsFromResponse"](["alpha"]);

    const logError = logger.error as jest.Mock;
    expect(logError).toHaveBeenCalledWith("thesaurus_request_failed", {
      provider: "merriam-webster",
      status: 503,
      code: "ERR_NETWORK",
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain(sentinel);
  });
});
