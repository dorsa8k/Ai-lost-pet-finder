import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError, SERVER_PROBLEM, textFields } from "@/lib/http";
import { log } from "@/lib/logger";

/** Admin changes a user's role and (for partners) links them to an organisation. */
export async function POST(request: Request) {
  const guard = await adminGuard(request);
  if ("response" in guard) return guard.response;
  const f = textFields(await request.formData());
  const userId = f.userId;
  const role = f.role;
  const organisationId = f.organisationId || null;
  if (!/^[0-9a-f-]{36}$/i.test(userId ?? "")) return jsonError(422, "Choose a user.", { userId: "Choose a user." });
  if (!["user", "partner", "admin"].includes(role)) return jsonError(422, "Choose a role.", { role: "Choose a role." });
  if (role === "partner" && !organisationId) {
    return jsonError(422, "Partners must be linked to an approved organisation.", { organisationId: "Choose an organisation." });
  }
  if (userId === guard.admin.id && role !== "admin") {
    return jsonError(409, "You can't remove your own admin access. Ask another admin.");
  }
  const admin = createAdminClient();
  if (organisationId) {
    const { data: org } = await admin.from("organisations").select("verified").eq("id", organisationId).maybeSingle();
    if (!org?.verified) return jsonError(422, "That organisation isn't verified.", { organisationId: "Not verified." });
  }
  const { data, error } = await admin
    .from("profiles")
    .update({ role, organisation_id: role === "user" ? null : organisationId })
    .eq("id", userId)
    .select("id");
  if (error) return jsonError(500, SERVER_PROBLEM);
  if (!data?.length) return jsonError(404, "User not found.");
  log.info("admin_role_change", { admin: guard.admin.id, user: userId, role });
  return NextResponse.json({ ok: true, message: "User updated." });
}
