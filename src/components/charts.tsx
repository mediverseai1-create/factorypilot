"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Datum = { name: string; value: number };

export function HBarChart({ data, unit, color = "#F59E0B", height }: { data: Datum[]; unit: string; color?: string; height?: number }) {
  const h = height ?? Math.max(160, data.length * 44);
  return (
    <div style={{ height: h }} role="img" aria-label={`Bar chart: ${data.map((d) => `${d.name} ${d.value} ${unit}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#E3E6EA" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "#6B7A8C" }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 13, fill: "#0B1B2B" }} />
          <Tooltip formatter={(v) => [`${v} ${unit}`, ""]} cursor={{ fill: "#F5F6F8" }} />
          <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ColumnChart({ data, unit, color = "#0B1B2B" }: { data: Datum[]; unit: string; color?: string }) {
  return (
    <div style={{ height: 220 }} role="img" aria-label={`Column chart of ${unit}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E3E6EA" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6B7A8C" }} interval={0} />
          <YAxis tick={{ fontSize: 12, fill: "#6B7A8C" }} allowDecimals={false} />
          <Tooltip formatter={(v) => [`${v} ${unit}`, ""]} cursor={{ fill: "#F5F6F8" }} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
