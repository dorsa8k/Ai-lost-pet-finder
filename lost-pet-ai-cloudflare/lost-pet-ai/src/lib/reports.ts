import "server-only";
import { createUserClient } from "./supabase/server";
import type { ReportWithPhotos } from "./types";
import type { SearchFilters } from "./validation";

const SELECT = "*, report_photos(id, report_id, storage_path, position, width, height)";
export const PAGE_SIZE = 24;

function sortPhotos(r: ReportWithPhotos): ReportWithPhotos {
  return { ...r, report_photos: [...(r.report_photos ?? [])].sort((a, b) => a.position - b.position) };
}

/** Recent active reports for the home page. Real reports first, then demo. */
export async function getRecentReports(limit = 8): Promise<ReportWithPhotos[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("pet_reports")
    .select(SELECT)
    .eq("status", "active")
    .eq("moderation", "visible")
    .order("is_demo", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ReportWithPhotos[]).map(sortPhotos);
}

export async function searchReports(f: SearchFilters): Promise<{ rows: ReportWithPhotos[]; total: number }> {
  const supabase = await createUserClient();
  let query = supabase
    .from("pet_reports")
    .select(SELECT, { count: "exact" })
    .eq("status", "active")
    .eq("moderation", "visible");
  if (f.kind) query = query.eq("kind", f.kind);
  if (f.species) query = query.eq("species", f.species);
  if (f.suburb) query = /^\d{4}$/.test(f.suburb) ? query.eq("postcode", f.suburb) : query.eq("suburb", f.suburb);
  if (f.days) query = query.gte("event_at", new Date(Date.now() - f.days * 86_400_000).toISOString());
  if (f.q) {
    const like = `%${f.q}%`;
    query = query.or(
      `breed.ilike.${like},primary_colour.ilike.${like},secondary_colour.ilike.${like},markings.ilike.${like},pet_name.ilike.${like},collar_description.ilike.${like}`,
    );
  }
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query
    .order("event_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data as ReportWithPhotos[]).map(sortPhotos), total: count ?? 0 };
}

export async function getReport(id: string): Promise<ReportWithPhotos | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("pet_reports").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? sortPhotos(data as ReportWithPhotos) : null;
}

/** Live counts for the home page. Demo records are excluded. */
export async function getPublicCounts() {
  const supabase = await createUserClient();
  const count = async (build: (q: any) => any) => {
    const { count } = await build(
      supabase.from("pet_reports").select("id", { count: "exact", head: true }).eq("is_demo", false),
    );
    return count ?? 0;
  };
  const [lost, found, reunited] = await Promise.all([
    count((q) => q.eq("kind", "lost")),
    count((q) => q.eq("kind", "found")),
    count((q) => q.eq("status", "reunited")),
  ]);
  return { lost, found, reunited };
}
