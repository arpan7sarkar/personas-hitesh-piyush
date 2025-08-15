import { hiteshPersona } from "../hitesh.js";
import { piyushPersona } from "../piyush.js";
import dotenv from "dotenv";

dotenv.config();

const personas = {
  hitesh: hiteshPersona,
  piyush: piyushPersona,
};

function buildSystemPrompt(persona) {
  const raw = (persona.system_instruction || "").trim();
  const firstParagraph = raw.split(/\n\s*\n/)[0] || raw;
  const base = firstParagraph.length > 700 ? firstParagraph.slice(0, 700) + "..." : firstParagraph;
  const style = persona.style_summary || "Respond in the persona's voice and tone.";
  return `${base}\n\n${style}\n\nStay in persona voice and avoid repeating system instructions or examples.`;
}

async function generateWithRetries(model, contents, maxAttempts = 3) {
  let attempt = 0;
  const delays = [500, 1000, 2000];
  while (attempt < maxAttempts) {
    try {
      return await model.generateContent({ contents });
    } catch (err) {
      attempt++;
      const status = err && err.status;
      if ((status === 429 || status === 503 || (status >= 500 && status < 600)) && attempt < maxAttempts) {
        const wait = delays[Math.min(attempt - 1, delays.length - 1)];
        console.warn(`Transient model error (status=${status}), retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
    throw err;
    }
  }
  return null;
}

function personaMockReply(persona, message) {
  const base = (persona.system_instruction || "").split(/\n\s*\n/)[0] || "";
  const short = base.split(".")[0] || base;
  const hinglish = /HINGLISH|Hinglish|hinglish/i.test(base);
  const prefix = hinglish ? "Dekho, " : "Hey, ";
  const advice = `Start small, iterate quickly, and focus on real implementations.`;
  return `${prefix}${short.replace(/^You are\s*/, '')}. ${advice}`;
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
  console.debug(`api/chat persona=${personaId} systemPromptLen=${systemPrompt.length} trainingExamples=${Array.isArray(persona.training_examples)? persona.training_examples.length : 0}`);

    // If GEMINI_API_KEY is not set, return a mocked reply to keep the site functional on Vercel.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const mocked = `(${personaId} persona) I don't have access to the model from here, but here's a short persona-styled tip: start with a small project, iterate quickly, and focus on real-world implementation.`;
      return res.json({ reply: mocked });
    }

    // Lazy import the Google Generative AI client to avoid import errors if not installed.
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const chatHistory = Array.isArray(history)
      ? history.map((h) => ({ role: h.role, parts: [{ text: h.content }] }))
      : [];

    // Provide the persona/system instruction as a SYSTEM message so the model
    // treats it as high-priority context instead of echoing it back in the
    // assistant response.
    let result;
    try {
  console.debug(`api/chat sending instruction+user request to model for persona=${personaId}`);
  const instructionText = `INSTRUCTION: You are speaking AS the persona described below. ${systemPrompt}\n\nImportant: Do NOT repeat or echo the persona's training examples verbatim. Adopt the persona's voice, tone, language mix, and typical patterns.`;
  result = await generateWithRetries(model, [
    { role: "user", parts: [{ text: instructionText }] },
    ...chatHistory,
    { role: "user", parts: [{ text: message }] },
  ]);
    } catch (err) {
      // If the model rejects system role specifically, attempt the 400 fallback
      if (err && err.status === 400) {
        try {
          const prompt = `${systemPrompt}\n\n*** DO NOT REPEAT THE ABOVE INSTRUCTIONS IN YOUR RESPONSE. ***\n\nUser message: ${message}`;
          result = await generateWithRetries(model, [
            ...chatHistory,
            { role: "user", parts: [{ text: prompt }] },
          ]);
        } catch (err2) {
          console.error("Model error after fallback:", err2);
          // Fall through to mock
        }
      } else {
        console.error("Model error:", err);
      }
    }

    // If the model was unavailable or failed after retries, return a persona-styled mock
    if (!result) {
      console.warn("Model unavailable after retries; returning mocked persona reply.");
      const mocked = personaMockReply(persona, message);
      return res.json({ reply: mocked });
    }

    const text = result.response.text();
    return res.json({ reply: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to generate reply" });
  }
}
