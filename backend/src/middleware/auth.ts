import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedUser, UserRole } from "../types/index.js";

interface AccessTokenPayload {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
  districtId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function signAccessToken(user: AuthenticatedUser): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
  // Only embed districtId when present, so users without a district (super
  // admin, DoLR, etc.) get an identical token shape to before.
  if (user.districtId) payload.districtId = user.districtId;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

/** Requires a valid JWT on every request. Never trust the frontend's route guard alone. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or malformed Authorization header.");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      districtId: payload.districtId,
    };
    next();
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired token.");
  }
}

/** Restricts a route to specific roles. Always used after requireAuth. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
    }
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, "FORBIDDEN", `This action requires one of: ${roles.join(", ")}.`);
    }
    next();
  };
}
