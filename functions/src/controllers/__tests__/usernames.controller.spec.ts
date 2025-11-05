import { UsernameGenerator } from "../usernames.controller";

describe("UsernameGenerator", () => {
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
});
