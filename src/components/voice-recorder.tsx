"use client";
import { useEffect, useRef, useState } from "react";

type Props = { onApprove: (transcript: string) => Promise<void> | void };

/** Records audio in the browser (MediaRecorder), transcribes it server-side with Gemini, and lets the operator correct it before it is kept. */
export function VoiceRecorder({ onApprove }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "transcribing" | "review">("idle");
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [unclear, setUnclear] = useState<string[]>([]);
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setSupported(typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"); }, []);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); void send(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" })); };
      mr.start();
      rec.current = mr;
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => { if (s >= 179) { stop(); } return s + 1; }), 1000);
      setState("recording");
    } catch (e) {
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone permission was denied. Allow it in your browser settings or type your note instead." : "Could not access a microphone on this device.");
    }
  }
  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    setState("transcribing");
  }
  async function send(blob: Blob) {
    const fd = new FormData();
    fd.append("audio", blob, "note.webm");
    try {
      const r = await fetch("/api/transcribe", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Transcription failed");
      setText(j.transcript); setUnclear(j.unclear ?? []); setState("review");
    } catch (e) { setError(e instanceof Error ? e.message : "Transcription failed"); setState("idle"); }
  }

  if (supported === null) return null;
  if (!supported) return <p className="rounded-lg bg-canvas-soft px-3 py-2 text-[13px] text-ink-500">Voice recording isn’t supported in this browser. Type your note instead, or use a current Chrome, Edge, Safari or Firefox.</p>;

  return (
    <div className="rounded-xl border border-canvas-line p-4">
      <div className="flex flex-wrap items-center gap-3">
        {state === "idle" && <button type="button" onClick={start} className="btn-dark btn-sm">● Record voice note</button>}
        {state === "recording" && (<>
          <button type="button" onClick={stop} className="btn btn-sm bg-signal-red text-white hover:bg-red-800">■ Stop ({seconds}s)</button>
          <span className="flex items-center gap-2 text-[13px] text-signal-red"><span className="h-2 w-2 animate-pulse rounded-full bg-signal-red" />Recording… up to 3 minutes</span>
        </>)}
        {state === "transcribing" && <span className="text-[14px] text-ink-500" role="status">Transcribing…</span>}
        {state === "idle" && <span className="text-[13px] text-ink-400">Transcribed by AI. You review it before it’s kept.</span>}
      </div>
      {error && <p role="alert" className="mt-3 text-[13px] font-medium text-signal-red">{error}</p>}
      {state === "review" && (
        <div className="mt-4 space-y-3">
          <label className="label" htmlFor="vt">Transcript: correct anything the AI misheard</label>
          <textarea id="vt" value={text} onChange={(e) => setText(e.target.value)} rows={4} className="field" />
          {unclear.length > 0 && <p className="text-[13px] text-amber-700">Unclear segments: {unclear.join("; ")}</p>}
          <div className="flex gap-3">
            <button type="button" className="btn-primary btn-sm" onClick={async () => { await onApprove(text); setState("idle"); setText(""); }}>Approve and add to notes</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setState("idle"); setText(""); }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
