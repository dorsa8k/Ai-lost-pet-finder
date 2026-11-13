import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError, SERVER_PROBLEM, textFields } from "@/lib/http";

/** Admin resolves or dismisses a moderation flag. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard(request);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const status = textFields(await request.formData()).status;
  if (status !== "resolved" && status !== "dismissed") return jsonError(422, "Unknown action.");
  const { data, error } = await createAdminClient()
    .from("moderation_flags")
    .update({ status, resolved_by: guard.admin.id, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return jsonError(500, SERVER_PROBLEM);
  if (!data?.length) return jsonError(404, "Flag not found.");
  return NextResponse.json({ ok: true, message: status === "resolved" ? "Marked as resolved." : "Flag dismissed." });
}
