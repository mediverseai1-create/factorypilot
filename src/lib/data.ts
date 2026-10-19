import { createClient } from "@/lib/supabase/server";

type SB = Awaited<ReturnType<typeof createClient>>;

export async function getPeople(sb: SB, orgId: string) {
  const { data: m } = await sb.from("organization_members").select("user_id,role").eq("org_id", orgId);
  const ids = (m ?? []).map((x) => x.user_id);
  const { data: p } = ids.length ? await sb.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  return (m ?? []).map((x) => ({ id: x.user_id as string, role: x.role as string, name: p?.find((q) => q.id === x.user_id)?.full_name || "Member" }));
}

export async function getEquipmentList(sb: SB, orgId: string) {
  const { data } = await sb.from("equipment").select("id,name,identifier,status,line_id,equipment_type").eq("org_id", orgId).order("name");
  return data ?? [];
}

export const nameMap = <T extends { id: string; name: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r.name]));
