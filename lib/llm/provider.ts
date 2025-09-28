import Anthropic from "@anthropic-ai/sdk";

export async function arToEn_claude({
  arabic,
  system,
  seed = 42,
  temperature = 0.2
}: {
  arabic: string;
  system: string;
  seed?: number;
  temperature?: number;
}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const res = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    temperature,
    max_tokens: 1200,
    system,
    messages: [{ role: "user", content: arabic }]
  });

  return res.content?.map(b => ("text" in b ? b.text : "")).join("") || "";
}