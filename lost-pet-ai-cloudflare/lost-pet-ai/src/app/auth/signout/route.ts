import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (isSameOrigin(request)) {
    const supabase = await createUserClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", url.origin), { status: 303 });
}
