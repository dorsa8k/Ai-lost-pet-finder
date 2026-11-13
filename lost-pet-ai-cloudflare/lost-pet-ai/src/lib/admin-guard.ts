import "server-only";
import { getCurrentUser, type CurrentUser } from "./auth";
import { isSameOrigin, jsonError } from "./http";
import { isSupabaseConfigured } from "./config";

/** Every admin API route starts with this. Returns the admin user, or an error response. */
export async function adminGuard(request: Request): Promise<{ admin: CurrentUser } | { response: Response }> {
  if (!isSupabaseConfigured()) return { response: jsonError(503, "The database isn't connected yet.") };
  if (!isSameOrigin(request)) return { response: jsonError(403, "This request must come from the website.") };
  const user = await getCurrentUser();
  if (!user) return { response: jsonError(401, "Please log in again.") };
  if (user.role !== "admin") return { response: jsonError(403, "Only administrators can do this.") };
  return { admin: user };
}
