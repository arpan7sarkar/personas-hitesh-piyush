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

function buildSystemPrompt(persona) {
  const base = persona.system_instruction || "";
  const examples = Array.isArray(persona.training_examples)
    ? persona.training_examples
        .slice(0, 10)
        .map(
          (ex) =>
            `User: ${ex.user_input}\nAssistant: ${ex.expected_response}`
        )
        .join("\n\n")
    : "";
  return `${base}\n\nStay strictly in persona voice. Keep responses within persona word count if specified.\n\nFew-shot examples to imitate style:\n${examples}`;
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
    const model = getModel();

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


