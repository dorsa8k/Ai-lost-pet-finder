import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { isSameOrigin, jsonError, textFields } from "@/lib/http";

/** Saves the signed-in user's alert preferences. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "This request must come from the website.");
  const f = textFields(await request.formData());
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Please log in again.");
  const { error } = await supabase
    .from("profiles")
    .update({ notify_in_app: f.notifyInApp === "on", notify_email: f.notifyEmail === "on" })
    .eq("id", user.id);
  if (error) return jsonError(500, "We couldn't save your preferences. Please try again.");
  return NextResponse.json({ ok: true, message: "Alert preferences saved." });
}
