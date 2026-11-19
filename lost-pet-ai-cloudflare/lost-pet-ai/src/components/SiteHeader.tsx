import Link from "next/link";
import { APP_NAME, isSupabaseConfigured } from "@/lib/config";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { Logo } from "./Logo";

const NAV = [
  { href: "/report/lost", label: "Lost a pet" },
  { href: "/report/found", label: "Found a pet" },
  { href: "/search", label: "Search" },
  { href: "/partner", label: "For vets & shelters" },
  { href: "/about", label: "About" },
];

export async function SiteHeader() {
  let user: CurrentUser | null = null;
  let unread = 0;
  if (isSupabaseConfigured()) {
    try {
      user = await getCurrentUser();
      if (user) {
        const supabase = await createUserClient();
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null);
        unread = count ?? 0;
      }
    } catch {
      user = null;
    }
  }

  const account = user ? (
    <>
      <Link href="/dashboard" className="font-semibold">
        My dashboard
      </Link>
      <Link href="/notifications" className="font-semibold" aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}>
        Alerts{unread > 0 && <span className="ml-1 rounded-full bg-coral text-white px-2 text-sm">{unread}</span>}
      </Link>
      {user.role !== "user" && (
        <Link href={user.role === "admin" ? "/admin" : "/partner/dashboard"} className="font-semibold">
          {user.role === "admin" ? "Admin" : "Partner portal"}
        </Link>
      )}
      <form action="/auth/signout" method="post">
        <button className="btn btn-outline btn-small" type="submit">
          Log out
        </button>
      </form>
    </>
  ) : (
    <>
      <Link href="/login" className="font-semibold">
        Log in
      </Link>
      <Link href="/signup" className="btn btn-teal btn-small">
        Sign up
      </Link>
    </>
  );

  return (
    <header className="bg-cream border-b border-line">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 no-underline" aria-label={`${APP_NAME} home`}>
          <Logo />
          <span className="font-display text-xl font-bold text-teal">{APP_NAME}</span>
        </Link>

        <nav aria-label="Main" className="hidden lg:flex items-center gap-6 text-[0.98rem]">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="no-underline hover:underline">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-4">{account}</div>

        {/* Mobile menu: native <details> works without JavaScript */}
        <details className="lg:hidden relative">
          <summary className="btn btn-outline btn-small list-none cursor-pointer">Menu</summary>
          <div className="absolute right-0 mt-2 w-64 bg-paper border border-line rounded-xl shadow-lg p-4 z-40 flex flex-col gap-3">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="no-underline font-semibold">
                {n.label}
              </Link>
            ))}
            <hr className="border-line" />
            {account}
          </div>
        </details>
      </div>
    </header>
  );
}
