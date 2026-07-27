import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AuthResult = { userId: string } | { error: string; status: number };

/** Every LLM-backed API route needs this first: don't spend a Groq call on
 * an anonymous request. RLS protects the database, but a serverless route
 * itself has no such gate by default. */
export async function verifySession(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Missing auth token", status: 401 };

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return { error: "Invalid or expired session", status: 401 };
  return { userId: data.user.id };
}

type GroqResult = { text: string } | { error: string; status: number };

/** Shared by every route that calls Groq (draft-cover-letter, tailor-resume,
 * referral-draft): same primary-key -> fallback-key behavior, same error
 * shape. The 100k-tokens/day cap is per Groq account, so a second key
 * (tracked separately by Groq) is a real budget increase, not padding. */
export async function callGroq(prompt: string, maxTokens: number): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { error: "Server is missing GROQ_API_KEY (set it in Vercel project env vars)", status: 500 };
  }

  const call = (key: string) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

  let res = await call(apiKey);

  if (res.status === 429) {
    const fallbackKey = process.env.GROQ_API_KEY_FALLBACK;
    if (fallbackKey) {
      res = await call(fallbackKey);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    return { error: `Groq API error: ${text}`, status: 502 };
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) return { error: "Model returned an empty response", status: 502 };
  return { text };
}
