"use client";
import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/app/task-actions";

export function FeedbackButtons({ table, targetId }: { table: string; targetId: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const send = (r: "helpful" | "incorrect" | "incomplete") => start(async () => {
    const res = await submitFeedback(table, targetId, r);
    if (res?.error) setErr(res.error); else setDone(r);
  });
  if (done) return <p role="status" className="text-[13px] font-semibold text-signal-green">Marked “{done}”. Thank you.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {(["helpful", "incomplete", "incorrect"] as const).map((r) => (<button key={r} disabled={pending} onClick={() => send(r)} className="btn-ghost btn-sm capitalize">{r}</button>))}
      {err && <span role="alert" className="text-[13px] text-signal-red">{err}</span>}
    </div>
  );
}
