import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can, ROLES, ROLE_LABEL, type Role } from "@/lib/auth/permissions";
import { getPeople } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Notice, PageHeader, fmt } from "@/components/ui";
import { changeRole, inviteMember, removeMember, revokeInvite } from "../admin-actions";

export const metadata = { title: "Team & Permissions" };

const DESC: Record<Role, string> = {
  owner: "Full control including billing, roles and settings.",
  administrator: "Manages members, settings and data; no ownership transfer.",
  plant_manager: "Reviews and approves across the plant; manages configuration.",
  shift_supervisor: "Reviews handovers, approves work orders and knowledge.",
  maintenance_technician: "Manages equipment, maintenance and investigations; confirms findings.",
  operator: "Captures notes, submits handovers, logs incidents and downtime.",
  quality_manager: "Captures and reports quality and process records.",
  viewer: "Read-only access.",
};

export default async function Team() {
  const ctx = await getCtx();
  const sb = await createClient();
  const [people, { data: members }, { data: invites }] = await Promise.all([
    getPeople(sb, ctx.orgId),
    sb.from("organization_members").select("id,user_id,role,created_at").eq("org_id", ctx.orgId).order("created_at"),
    can(ctx.role, "team.manage") ? sb.from("organization_invites").select("id,email,role,created_at").eq("org_id", ctx.orgId).is("accepted_at", null) : Promise.resolve({ data: [] }),
  ]);
  const admin = can(ctx.role, "team.manage");
  return (
    <>
      <PageHeader eyebrow="Access control" title="Team & permissions" subtitle="Permissions are enforced in the database with Row Level Security, not just in the interface." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title={`Members (${members?.length ?? 0})`} pad={false}>
            <table className="w-full"><thead className="border-b border-canvas-line"><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Joined</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-canvas-line">{members?.map((m) => (
                <tr key={m.id}>
                  <td className="td font-semibold">{people.find((p) => p.id === m.user_id)?.name}{m.user_id === ctx.userId && <span className="ml-2 text-[12px] text-ink-400">(you)</span>}</td>
                  <td className="td">{admin && m.user_id !== ctx.userId && (m.role !== "owner" || ctx.role === "owner") ? (
                    <form action={changeRole.bind(null, m.id)} className="flex gap-2"><select name="role" defaultValue={m.role} aria-label="Role" className="field !w-52 !py-1.5 text-sm">{ROLES.filter((r) => r !== "owner" || ctx.role === "owner").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select><button className="btn-ghost btn-sm">Save</button></form>)
                    : <Badge tone={m.role === "owner" ? "amber" : "neutral"}>{ROLE_LABEL[m.role as Role]}</Badge>}</td>
                  <td className="td">{fmt(m.created_at, false)}</td>
                  <td className="td">{admin && m.user_id !== ctx.userId && m.role !== "owner" && <form action={removeMember.bind(null, m.id)}><button className="btn-ghost btn-sm">Remove</button></form>}</td>
                </tr>))}</tbody></table>
          </Card>
          {admin && (invites?.length ?? 0) > 0 && (
            <Card title="Pending invitations">
              <ul className="divide-y divide-canvas-line text-[14px]">{invites!.map((i) => <li key={i.id} className="flex items-center justify-between py-2.5"><span>{i.email} · <Badge>{ROLE_LABEL[i.role as Role]}</Badge></span><form action={revokeInvite.bind(null, i.id)}><button className="btn-ghost btn-sm">Revoke</button></form></li>)}</ul>
            </Card>)}
          <Card title="What each role can do"><dl className="space-y-3 text-[14px]">{ROLES.map((r) => <div key={r} className="flex gap-4"><dt className="w-48 shrink-0 font-bold">{ROLE_LABEL[r]}</dt><dd className="text-ink-500">{DESC[r]}</dd></div>)}</dl></Card>
        </div>
        {admin ? (
          <Card title="Invite a teammate">
            <ActionForm action={inviteMember} className="space-y-4">
              <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="field" /></div>
              <div><label className="label" htmlFor="role">Role</label><select id="role" name="role" defaultValue="operator" className="field">{ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
              <SubmitButton className="btn-dark w-full">Create invitation</SubmitButton>
            </ActionForm>
            <p className="mt-3 text-[12px] text-ink-400">Invitations don’t send email. Share your sign-up link; when that person signs up or signs in with the invited address they join automatically.</p>
          </Card>
        ) : <Notice tone="blue">Only Owners and Administrators can manage the team.</Notice>}
      </div>
    </>
  );
}
