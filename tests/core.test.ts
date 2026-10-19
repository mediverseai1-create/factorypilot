import { describe, expect, it } from "vitest";
import { computeStats, minutesOf } from "@/lib/downtime";
import { autoMap, parseTimestamp, summarise, validateRows, equipmentKey } from "@/lib/import/schema";
import { mentionedEquipment, resolveEquipment, verifyQuote } from "@/lib/grounding";
import { screenUnsafe } from "@/lib/ai/safety";
import { can } from "@/lib/auth/permissions";
import { handoverReport } from "@/lib/ai/schemas";

const ev = (id: string, eq: string, at: string, extra = {}) => ({
  id, equipment_id: eq, started_at: at, ended_at: null, duration_minutes: 10, fault_code: "F12", shift_label: "Night", context: "material change", cause_category: null, ...extra,
});

describe("downtime stats", () => {
  it("counts recurring faults and never invents durations", () => {
    const s = computeStats([ev("1", "a", "2026-01-01T01:00:00Z"), ev("2", "a", "2026-01-02T01:00:00Z"), ev("3", "a", "2026-01-03T02:00:00Z", { duration_minutes: null })]);
    expect(s.total).toBe(3);
    expect(s.withDuration).toBe(2);
    expect(s.totalMinutes).toBe(20);
    expect(s.recurring[0]).toMatchObject({ equipmentId: "a", count: 3 });
    expect(s.contextRepeats[0].count).toBe(3);
  });
  it("derives minutes from timestamps and rejects negatives", () => {
    expect(minutesOf({ started_at: "2026-01-01T00:00:00Z", ended_at: "2026-01-01T00:30:00Z", duration_minutes: null })).toBe(30);
    expect(minutesOf({ started_at: "2026-01-01T01:00:00Z", ended_at: "2026-01-01T00:30:00Z", duration_minutes: null })).toBeNull();
  });
});

describe("csv import validation", () => {
  const known = new Set([equipmentKey("PR-3"), equipmentKey("Press 3")]);
  const mapping = autoMap("downtime_events", ["Machine", "Start Time", "Duration", "Alarm"]);
  it("auto-maps common headers", () => {
    expect(mapping).toMatchObject({ equipment: "Machine", started_at: "Start Time", duration_minutes: "Duration", fault_code: "Alarm" });
  });
  it("reports invalid timestamps, unknown equipment and duplicates", () => {
    const rows = [
      { Machine: "PR-3", "Start Time": "2026-02-01 08:00", Duration: "12", Alarm: "E1" },
      { Machine: "PR-3", "Start Time": "2026-02-01 08:00", Duration: "12", Alarm: "E1" },
      { Machine: "PR-3", "Start Time": "not a date", Duration: "5", Alarm: "" },
      { Machine: "XX-9", "Start Time": "2026-02-02", Duration: "5", Alarm: "" },
    ];
    const s = summarise(validateRows("downtime_events", rows, mapping, { knownEquipment: known }));
    expect(s).toMatchObject({ total: 4, valid: 1, duplicates: 1, invalidTimestamps: 1, unrecognisedEquipment: 1 });
  });
  it("parses dd/mm/yyyy and rejects absurd years", () => {
    expect(parseTimestamp("03/02/2026 10:15")).toBe("2026-02-03T10:15:00.000Z");
    expect(parseTimestamp("1850-01-01")).toBeNull();
  });
});

describe("grounding", () => {
  const eq = [{ id: "1", name: "Press 3", identifier: "PR-3", line_id: null }, { id: "2", name: "Conveyor 1", identifier: "CV-1", line_id: null }];
  it("resolves references and finds mentions", () => {
    expect(resolveEquipment("press 3", eq)?.id).toBe("1");
    expect(resolveEquipment("PR-3", eq)?.id).toBe("1");
    expect(resolveEquipment("Lathe 9", eq)).toBeNull();
    expect(mentionedEquipment("Press 3 stopped twice", eq).map((e) => e.id)).toEqual(["1"]);
  });
  it("verifies quotes against the source only", () => {
    expect(verifyQuote("sounded unusual", "It sounded unusual before the second stop.")).toBe(true);
    expect(verifyQuote("bearing failed", "It sounded unusual before the second stop.")).toBe(false);
    expect(verifyQuote("", "anything")).toBe(false);
  });
});

describe("safety + permissions", () => {
  it("flags output that defeats safety controls", () => {
    expect(screenUnsafe("Bypass the interlock to keep running")).not.toHaveLength(0);
    expect(screenUnsafe("Skip lockout and clear the jam")).not.toHaveLength(0);
    expect(screenUnsafe("Inspect the feed mechanism under LOTO")).toHaveLength(0);
  });
  it("restricts approvals and administration", () => {
    expect(can("operator", "workorder.approve")).toBe(false);
    expect(can("shift_supervisor", "workorder.approve")).toBe(true);
    expect(can("viewer", "capture")).toBe(false);
    expect(can("maintenance_technician", "team.manage")).toBe(false);
  });
});

describe("handover schema", () => {
  it("accepts minimal model output with defaults", () => {
    const r = handoverReport.parse({ summary: "x", sections: [{ key: "safety", items: [{ text: "y" }] }] });
    expect(r.sections[0].items[0].finding).toBe("reported");
    expect(r.issues).toEqual([]);
  });
});
