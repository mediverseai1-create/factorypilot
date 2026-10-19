export const ROLES = ["owner","administrator","plant_manager","shift_supervisor","maintenance_technician","operator","quality_manager","viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner", administrator: "Administrator", plant_manager: "Plant Manager", shift_supervisor: "Shift Supervisor",
  maintenance_technician: "Maintenance Technician", operator: "Operator", quality_manager: "Quality Manager", viewer: "Read-only Viewer",
};

export type Permission =
  | "capture" | "handover.submit" | "handover.review" | "knowledge.search" | "knowledge.approve" | "knowledge.confirm"
  | "equipment.manage" | "workorder.draft" | "workorder.approve" | "investigation.run" | "investigation.confirm"
  | "import" | "ai.run" | "team.manage" | "billing.view" | "settings.manage" | "followup.update";

const WRITERS: Role[] = ["owner","administrator","plant_manager","shift_supervisor","maintenance_technician","operator","quality_manager"];
const STAFF: Role[] = ["owner","administrator","plant_manager","shift_supervisor","maintenance_technician"];
const APPROVERS: Role[] = ["owner","administrator","plant_manager","shift_supervisor"];
const MANAGERS: Role[] = ["owner","administrator","plant_manager"];

// UI hints only. The database enforces the same rules via RLS + guard triggers (see migration 0001).
const MATRIX: Record<Permission, Role[]> = {
  capture: WRITERS, "handover.submit": WRITERS, "handover.review": APPROVERS, "knowledge.search": ROLES as unknown as Role[],
  "knowledge.approve": APPROVERS, "knowledge.confirm": STAFF, "equipment.manage": STAFF, "workorder.draft": WRITERS,
  "workorder.approve": APPROVERS, "investigation.run": STAFF, "investigation.confirm": STAFF, import: STAFF, "ai.run": WRITERS,
  "team.manage": ["owner","administrator"], "billing.view": MANAGERS, "settings.manage": MANAGERS, "followup.update": WRITERS,
};
export const can = (role: Role | undefined, p: Permission) => !!role && MATRIX[p].includes(role);
