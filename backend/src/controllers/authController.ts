import type { Request, Response } from "express";
import { loginSchema } from "../validators/schemas.js";
import { verifyCredentials } from "../services/authService.js";
import { signAccessToken } from "../middleware/auth.js";
import { ok } from "../utils/apiResponse.js";

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const user = await verifyCredentials(input.email, input.password);
  const token = signAccessToken(user);
  ok(res, { token, user });
}

export async function me(req: Request, res: Response) {
  ok(res, req.user);
}
