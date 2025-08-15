import { hiteshPersona } from "../hitesh.js";
import { piyushPersona } from "../piyush.js";
import dotenv from "dotenv";

dotenv.config();

const personas = {
  hitesh: hiteshPersona,
  piyush: piyushPersona,
};

function buildSystemPrompt(persona) {
  const base = persona.system_instruction || "";
  const examples = Array.isArray(persona.training_examples)
    ? persona.training_examples
        .slice(0, 10)
        .map((ex) => `User: ${ex.user_input}\nAssistant: ${ex.expected_response}`)
        .join("\n\n")
    : "";
  return `${base}\n\nStay strictly in persona voice. Keep responses within persona word count if specified.\n\nFew-shot examples to imitate style:\n${examples}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { personaId, message, history } = req.body || {};
    if (!personaId || !message) {
      return res.status(400).json({ error: "personaId and message required" });
    }

    const persona = personas[personaId];
    if (!persona) {
      return res.status(400).json({ error: "Unknown personaId" });
    }

    const systemPrompt = buildSystemPrompt(persona);

    // If GEMINI_API_KEY is not set, return a mocked reply to keep the site functional on Vercel.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const mocked = `(${personaId} persona) Echo: ${message}`;
      return res.json({ reply: mocked });
    }

    // Lazy import the Google Generative AI client to avoid import errors if not installed.
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const chatHistory = Array.isArray(history)
      ? history.map((h) => ({ role: h.role, parts: [{ text: h.content }] }))
      : [];

    const prompt = `${systemPrompt}\n\nNow reply to the user. User message: ${message}`;

    const result = await model.generateContent({
      contents: [
        ...chatHistory,
        { role: "user", parts: [{ text: prompt }] },
      ],
    });

    const text = result.response.text();
    return res.json({ reply: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to generate reply" });
  }
}
