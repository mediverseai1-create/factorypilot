/**
 * Integration framework. A connector is only "supported" when code for it exists in this repository.
 * Everything else is "planned" and is shown that way: no connector is simulated.
 */
export type ConnectorStatus = "supported" | "planned";

export interface Connector {
  id: string; label: string; kind: "csv" | "cmms" | "mes" | "erp" | "scada" | "historian" | "other";
  status: ConnectorStatus; description: string;
  /** Contract a future connector implements: pull normalised records into the same ingestion pipeline the CSV importer uses. */
  pull?: (since: Date) => Promise<{ kind: string; rows: Record<string, unknown>[] }[]>;
}

export const CONNECTORS: Connector[] = [
  { id: "csv", label: "CSV import", kind: "csv", status: "supported", description: "Upload, map, validate, preview and import equipment, downtime, maintenance, incidents and shift notes." },
  { id: "cmms", label: "CMMS (e.g. work-order systems)", kind: "cmms", status: "planned", description: "Sync work orders and maintenance history." },
  { id: "mes", label: "MES", kind: "mes", status: "planned", description: "Production events, orders and line status." },
  { id: "erp", label: "ERP", kind: "erp", status: "planned", description: "Parts, inventory and purchasing context." },
  { id: "scada", label: "SCADA / PLC", kind: "scada", status: "planned", description: "Machine states and alarms." },
  { id: "historian", label: "Data historian", kind: "historian", status: "planned", description: "Time-series telemetry for condition analysis." },
];
