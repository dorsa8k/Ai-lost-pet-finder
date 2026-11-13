import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { isSameOrigin, jsonError, textFields } from "@/lib/http";

/** Marks one notification (id) or all of the signed-in user's notifications as read. RLS limits this to their own. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "This request must come from the website.");
  const f = textFields(await request.formData());
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Please log in again.");
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (f.id) q = q.eq("id", f.id);
  else q = q.eq("user_id", user.id);
  const { error } = await q;
  if (error) return jsonError(500, "We couldn't update your notifications. Please try again.");
  return NextResponse.json({ ok: true, message: f.id ? "Marked as read." : "All marked as read." });
}
