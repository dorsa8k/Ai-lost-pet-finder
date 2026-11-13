import "server-only";
import { redirect } from "next/navigation";
import { createUserClient } from "./supabase/server";
import type { UserRole } from "./types";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  organisationId: string | null;
}

/** Returns the signed-in user and their profile, or null for visitors. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, organisation_id")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name || user.email?.split("@")[0] || "there",
    role: (profile?.role as UserRole) ?? "user",
    organisationId: profile?.organisation_id ?? null,
  };
}

export async function requireUser(nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export async function requireRole(roles: UserRole[], nextPath: string): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  if (!roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}
