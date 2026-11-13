import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { isSameOrigin, jsonError } from "@/lib/http";

/** Report owner marks a received message as read (RLS restricts this to the owner). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError(403, "This form must be sent from the website.");
  const { id } = await params;
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("report_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return jsonError(404, "We couldn't update that message.");
  return NextResponse.json({ ok: true, message: "Marked as read." });
}
