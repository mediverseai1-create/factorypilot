import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env, geminiConfigured } from "@/lib/env";
import { SAFETY_RULES, screenUnsafe } from "./safety";

export class AiNotConfiguredError extends Error {
  constructor() { super("GEMINI_API_KEY is not configured. Add it to the server environment to enable AI features."); }
}
export class AiSafetyError extends Error {}

let client: GoogleGenAI | null = null;
function ai() {
  if (!geminiConfigured()) throw new AiNotConfiguredError();
  return (client ??= new GoogleGenAI({ apiKey: env.gemini }));
}

export type Usage = { promptTokens: number; outputTokens: number; model: string };

/** Structured generation validated by Zod. Retries once with the validation error if the JSON is malformed. */
export async function generateStructured<S extends z.ZodTypeAny>(opts: {
  schema: S; task: string; prompt: string;
}): Promise<{ data: z.infer<S>; usage: Usage }> {
  const { $schema: _s, ...jsonSchema } = z.toJSONSchema(opts.schema, { io: "input" }) as Record<string, unknown>;
  const system = `${SAFETY_RULES}\n\nTASK: ${opts.task}\nReturn only JSON matching the provided schema.`;
  let contents = opts.prompt;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai().models.generateContent({
      model: env.geminiModel,
      contents,
      config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchema, temperature: 0.2 },
    });
    const text = res.text ?? "";
    const usage: Usage = {
      promptTokens: res.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
      model: env.geminiModel,
    };
    try {
      const parsed = opts.schema.parse(JSON.parse(text));
      const flagged = screenUnsafe(JSON.stringify(parsed));
      if (flagged.length) throw new AiSafetyError(`Output withheld: it appeared to recommend defeating a safety control ("${flagged[0]}").`);
      return { data: parsed, usage };
    } catch (e) {
      if (e instanceof AiSafetyError) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
      contents = `${opts.prompt}\n\nYour previous reply was invalid (${lastErr.slice(0, 400)}). Return corrected JSON only.`;
    }
  }
  throw new Error(`AI response failed schema validation: ${lastErr.slice(0, 300)}`);
}

const transcriptSchema = z.object({ transcript: z.string(), unclear_segments: z.array(z.string()).default([]) });

export async function transcribeAudio(base64: string, mimeType: string) {
  const res = await ai().models.generateContent({
    model: env.geminiModel,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: "Transcribe this factory-floor operator voice note verbatim. Do not summarise, correct facts, or add anything. Mark inaudible parts as [unclear] and list them in unclear_segments." },
      ],
    }],
    config: { responseMimeType: "application/json", responseJsonSchema: (({ $schema: _s, ...r }) => r)(z.toJSONSchema(transcriptSchema, { io: "input" }) as Record<string, unknown>), temperature: 0 },
  });
  const parsed = transcriptSchema.parse(JSON.parse(res.text ?? "{}"));
  const usage: Usage = {
    promptTokens: res.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    model: env.geminiModel,
  };
  return { transcript: parsed.transcript, unclear: parsed.unclear_segments, usage };
}

/** 768-d embedding (matches knowledge_records.embedding). Returns null when AI is not configured or the call fails. */
export async function embed(text: string): Promise<number[] | null> {
  if (!geminiConfigured()) return null;
  try {
    const r = await ai().models.embedContent({ model: env.embeddingModel, contents: text.slice(0, 8000), config: { outputDimensionality: 768 } });
    return r.embeddings?.[0]?.values ?? null;
  } catch {
    return null;
  }
}
