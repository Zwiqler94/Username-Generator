import {Request, Response} from "express";
import {getAppCheck} from "firebase-admin/app-check";
import {appCheckGaurd, errorHandler} from "../general.middleware";

jest.mock("firebase-admin/app-check", () => ({
  getAppCheck: jest.fn(),
}));
jest.mock("firebase-functions/logger", () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

describe("App Check error handling", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("does not forward verifier details to the error handler", async () => {
    const verifyToken = jest
      .fn()
      .mockRejectedValue(new Error("verifier-secret-detail"));
    (getAppCheck as jest.Mock).mockReturnValue({verifyToken});
    const req = {
      header: jest.fn().mockReturnValue("invalid-token"),
    } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
    } as unknown as Response;
    const next = jest.fn();

    await appCheckGaurd(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Unauthorized");
    expect(JSON.stringify(next.mock.calls)).not.toContain(
      "verifier-secret-detail",
    );
  });

  test("returns a generic 401 response without a stack", () => {
    const req = {} as Request;
    const json = jest.fn();
    const res = {
      headersSent: false,
      statusCode: 401,
      status: jest.fn().mockReturnThis(),
      json,
    } as unknown as Response;
    const next = jest.fn();

    errorHandler(new Error("verifier-secret-detail"), req, res, next);

    expect(json).toHaveBeenCalledWith({
      name: "UnauthorizedError",
      code: 401,
      description: "Unauthorized",
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain("stack");
    expect(JSON.stringify(json.mock.calls)).not.toContain(
      "verifier-secret-detail",
    );
  });
});
