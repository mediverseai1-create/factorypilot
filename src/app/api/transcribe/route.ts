import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { runAgent } from "@/lib/ai/orchestrator";
import { transcribeAudio } from "@/lib/ai/gemini";
import { AiNotConfiguredError } from "@/lib/ai/gemini";
import { EntitlementError } from "@/lib/billing/credits";

export const maxDuration = 60;
const MAX_BYTES = 8 * 1024 * 1024;
const OK_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac", "audio/flac"];

export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!can(ctx.role, "capture")) return NextResponse.json({ error: "Your role cannot record notes." }, { status: 403 });
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No audio received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Recording is too large (8 MB max). Record a shorter note." }, { status: 413 });
  const mime = file.type.split(";")[0] || "audio/webm";
  if (!OK_TYPES.includes(mime)) return NextResponse.json({ error: `Unsupported audio type ${mime}.` }, { status: 415 });
  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const { data } = await runAgent(ctx, {
      agent: "shift_handover", feature: "voice_transcription", task: "Transcribe voice note", inputSummary: `${mime} ${Math.round(file.size / 1024)}KB`,
      fn: async () => {
        const r = await transcribeAudio(b64, mime);
        return { data: { transcript: r.transcript, unclear: r.unclear }, usage: r.usage };
      },
    });
    return NextResponse.json(data);
  } catch (e) {
    const status = e instanceof AiNotConfiguredError ? 503 : e instanceof EntitlementError ? 402 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Transcription failed" }, { status });
  }
}
