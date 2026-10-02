import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";
import { ApiError } from "../utils/apiResponse.js";
import type { AuthenticatedUser } from "../types/index.js";

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: AuthenticatedUser["role"];
  district_id: string | null;
}

/**
 * districtId is carried on the user so downstream authorization can scope by
 * district. It was previously selected-but-dropped, which silently disabled
 * every district-scoped check that depended on it.
 */
function toAuthenticatedUser(user: UserRow): AuthenticatedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    districtId: user.district_id ?? undefined,
  };
}

export async function verifyCredentials(email: string, password: string): Promise<AuthenticatedUser> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id, name, email, password_hash, role, district_id FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  const user = rows[0];
  if (!user) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  return toAuthenticatedUser(user);
}

export async function findUserById(id: string): Promise<AuthenticatedUser | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id, name, email, role, district_id FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ? toAuthenticatedUser(rows[0]) : null;
}
