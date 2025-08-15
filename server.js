import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { hiteshPersona } from "./hitesh.js";
import { piyushPersona } from "./piyush.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const personas = {
  hitesh: hiteshPersona,
  piyush: piyushPersona,
};

async function generateWithRetries(model, contents, maxAttempts = 3) {
  let attempt = 0;
  const delays = [500, 1000, 2000];
  while (attempt < maxAttempts) {
    try {
      return await model.generateContent({ contents });
    } catch (err) {
      attempt++;
      const status = err && err.status;
      // Retry for transient server-side errors
      if ((status === 429 || status === 503 || (status >= 500 && status < 600)) && attempt < maxAttempts) {
        const wait = delays[Math.min(attempt - 1, delays.length - 1)];
        console.warn(`Transient model error (status=${status}), retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // For other errors, rethrow to let caller decide (e.g. 400 client errors)
    throw err;
    }
  }
  // If we exhausted retries, return null so caller can generate a mock reply instead
  return null;
}

function personaMockReply(persona, message) {
  // Build a short persona-styled reply using persona metadata (no examples).
  const name = persona.persona_id || "persona";
  const base = (persona.system_instruction || "").split(/\n\s*\n/)[0] || "";
  const short = base.split(".")[0] || base;
  // Heuristic: if persona mentions 'Hinglish', mix a Hinglish prefix
  const hinglish = /HINGLISH|Hinglish|hinglish/i.test(base);
  const prefix = hinglish ? "Dekho, " : "Hey, ";
  const advice = `Here's a quick suggestion: start with a small project, iterate, and focus on implementation.`;
  return `${prefix}${short.replace(/^You are\s*/, '')}. ${advice}`;
}

function buildSystemPrompt(persona) {
  // Keep the system prompt concise: use only the first paragraph of the
  // persona's system_instruction and cap its length to avoid verbatim echoes.
  const raw = (persona.system_instruction || "").trim();
  const firstParagraph = raw.split(/\n\s*\n/)[0] || raw;
  const base = firstParagraph.length > 700 ? firstParagraph.slice(0, 700) + "..." : firstParagraph;
  const style = persona.style_summary || "Respond in the persona's voice and tone.";
  return `${base}\n\n${style}\n\nStay in persona voice and avoid repeating system instructions or examples.`;
}

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY in environment. Add it to a .env file."
    );
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  // Use a sensible default model
  return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

app.get("/api/personas", (_req, res) => {
  res.json([
    { id: "hitesh", name: "Hitesh Choudhary" },
    { id: "piyush", name: "Piyush Garg" },
  ]);
});

app.post("/api/chat", async (req, res) => {
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
  // Debug info to help diagnose persona-specific issues
  console.debug(`chat request persona=${personaId} systemPromptLen=${systemPrompt.length} trainingExamples=${Array.isArray(persona.training_examples)? persona.training_examples.length : 0}`);
    const model = getModel();

    const chatHistory = Array.isArray(history)
      ? history.map((h) => ({ role: h.role, parts: [{ text: h.content }] }))
      : [];

    // Provide the persona/system instruction as a SYSTEM message so the model
    // treats it as high-priority context instead of echoing it back in the
    // assistant response.
    let result;
    try {
    console.debug(`Sending instruction+user request to model for persona=${personaId}`);
    // Because some endpoints reject a 'system' role, provide the persona
    // instructions as an explicit leading user instruction. Make it a clear
    // instruction to adopt the persona voice and not repeat any training
    // examples verbatim.
    const instructionText = `INSTRUCTION: You are speaking AS the persona described below. ${systemPrompt}\n\nImportant: Do NOT repeat or echo the persona's training examples verbatim. Adopt the persona's voice, tone, language mix, and typical patterns. Keep replies focused, helpful, and within the persona's word-count guidance.`;
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
    res.json({ reply: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate reply" });
  }
});

// Serve static files from public
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Global error handlers to keep the server alive during transient model errors
process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});


