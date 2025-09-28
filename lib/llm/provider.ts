import OpenAI from "openai";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export async function arToEn_chatgpt({
  arabic,
  system,
  temperature = 0.2,
  maxTokens = 1200
}: {
  arabic: string;
  system: string;
  temperature?: number;
  maxTokens?: number;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: arabic }
    ]
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
