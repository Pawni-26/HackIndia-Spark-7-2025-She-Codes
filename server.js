import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import FormData from "form-data";

// Setup __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// File upload middleware
const upload = multer({ storage: multer.memoryStorage() });

// Environment variables
const whisperEndpoint = process.env.AZURE_WHISPER_ENDPOINT;
const whisperApiKey = process.env.AZURE_WHISPER_API_KEY;
const whisperApiVersion = process.env.WHISPER_API_VERSION;

const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const openaiApiKey = process.env.AZURE_OPENAI_API_KEY;
const openaiApiVersion = process.env.OPENAI_API_VERSION;

// Transcription + Summary endpoint
app.post("/process-audio", upload.single("audio"), async (req, res) => {
  const audioBuffer = req.file?.buffer;
  const originalName = req.file?.originalname || "audio.webm";

  if (!audioBuffer) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  try {
    // Step 1: Transcribe using Whisper
    const formData = new FormData();
    formData.append("file", audioBuffer, originalName);
    formData.append("model", "whisper-1");
    formData.append("task", "translate");

    const whisperResponse = await fetch(
      `${whisperEndpoint}/openai/deployments/whisper/audio/transcriptions?api-version=${whisperApiVersion}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${whisperApiKey}`,
          ...formData.getHeaders(),
        },
        body: formData,
      }
    );

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      return res.status(whisperResponse.status).json({ error: "Transcription failed: " + errorText });
    }

    const whisperData = await whisperResponse.json();
    const transcriptionText = whisperData.text;

    // Step 2: Summarize using GPT-4o
    const gptResponse = await fetch(
      `${openaiEndpoint}/openai/deployments/gpt-4o/chat/completions?api-version=${openaiApiVersion}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are a helpful assistant that summarizes text clearly and briefly." },
            { role: "user", content: `Summarize this text:\n${transcriptionText}` }
          ],
          temperature: 0.5
        })
      }
    );

    if (!gptResponse.ok) {
      const errorText = await gptResponse.text();
      return res.status(gptResponse.status).json({ error: "Summary failed: " + errorText });
    }

    const gptData = await gptResponse.json();
    const summary = gptData.choices[0]?.message?.content || "No summary available.";

    res.json({ transcription: transcriptionText, summary });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
