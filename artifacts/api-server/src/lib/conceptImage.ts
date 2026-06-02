import { GoogleGenerativeAI } from "@google/generative-ai";

const IMAGE_MODEL = "gemini-2.5-flash-image";

/** Strip an optional data-URL prefix and return raw base64 + mime type. */
export function parseDataUrl(input: string): { base64: string; mimeType: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(input.trim());
  if (match) return { mimeType: match[1], base64: match[2] };
  return { mimeType: "image/png", base64: input.trim() };
}

/**
 * Image-to-image restyle: feeds an accurate plan plate (base64 PNG) plus a style
 * prompt to Gemini's native image model and returns the generated PNG bytes.
 */
export async function restylePlate(
  plateImage: string,
  prompt: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const { base64, mimeType } = parseDataUrl(plateImage);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: IMAGE_MODEL });

  const result = await model.generateContent([
    { inlineData: { data: base64, mimeType } },
    { text: prompt },
  ]);

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData;
    if (inline?.data) {
      return {
        buffer: Buffer.from(inline.data, "base64"),
        mimeType: inline.mimeType ?? "image/png",
      };
    }
  }
  throw new Error("Gemini returned no image data");
}
