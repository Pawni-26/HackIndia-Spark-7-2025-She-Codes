import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { spawn } from 'child_process';
import axios from 'axios';
import dotenv from 'dotenv';
import FormData from 'form-data';
import OpenAI from 'openai';
import path from 'path';

dotenv.config();

const app = express();
const port = 3000;
const upload = multer({ dest: 'uploads/' });

const AZURE_API_KEY = process.env.AZURE_API_KEY;
const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
const WHISPER_DEPLOYMENT_ID = process.env.AZURE_DEPLOYMENT_ID;
const GPT_DEPLOYMENT_ID = process.env.AZURE_GPT_DEPLOYMENT_ID;
const API_VERSION = '2024-02-15-preview';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

const openai = new OpenAI({
    apiKey: AZURE_API_KEY,
    baseURL: `${AZURE_ENDPOINT}/openai/deployments/${GPT_DEPLOYMENT_ID}`,
    defaultHeaders: { 'api-key': AZURE_API_KEY },
    defaultQuery: { 'api-version': API_VERSION }
});

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'video_upload.html'));
});

app.get('/quiz.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'quiz.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).send('No file uploaded.');

    const ext = file.originalname.split('.').pop().toLowerCase();
    let audioPath = file.path;

    try {
        if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
            audioPath = `${file.path}.mp3`;
            await extractAudio(file.path, audioPath);
        }

        const transcript = await transcribeWithAzure(audioPath);
        const summary = await summarizeWithGPT(transcript);
        const topicBreakdown = await topicSegmentation(transcript);

        await sendToNotion({
            name: file.originalname,
            date: new Date().toISOString(),
            category: 'Meeting',
            attendees: '',
            summary
        });

        fs.unlinkSync(file.path);
        if (audioPath !== file.path) fs.unlinkSync(audioPath);

        res.json({
            message: 'Transcription, summary, and Notion upload complete!',
            transcript,
            summary,
            topicBreakdown
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.json({ message: 'Failed to process file.' });
    }
});

function extractAudio(videoPath, audioPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('C:\\Users\\poorv\\Downloads\\ffmpeg-7.1.1-essentials_build\\ffmpeg-7.1.1-essentials_build\\bin\\ffmpeg', [
            '-i', videoPath, '-q:a', '0', '-map', 'a', audioPath
        ]);
        ffmpeg.on('error', reject);
        ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
    });
}

async function transcribeWithAzure(audioPath) {
    const url = `${AZURE_ENDPOINT}/openai/deployments/${WHISPER_DEPLOYMENT_ID}/audio/transcriptions?api-version=${API_VERSION}`;
    const audioFile = fs.createReadStream(audioPath);
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    const response = await axios.post(url, formData, {
        headers: { 'api-key': AZURE_API_KEY, ...formData.getHeaders() },
        maxBodyLength: Infinity
    });

    return response.data.text;
}

async function summarizeWithGPT(transcript) {
    const messages = [
        { role: 'system', content: 'You are a helpful assistant that summarizes transcripts.' },
        { role: 'user', content: `Summarize the following transcript:\n\n${transcript}` }
    ];

    const response = await openai.chat.completions.create({
        messages,
        temperature: 0.5,
        max_tokens: 500,
        model: 'gpt-4o'
    });

    return response.choices[0].message.content.trim();
}

async function topicSegmentation(transcript) {
    const messages = [
        { role: 'system', content: 'You are a helpful assistant that segments meeting transcripts into topics and summarizes each one.' },
        { role: 'user', content: `Break the following transcript into topics and provide a summary for each one:\n\n${transcript}` }
    ];

    const response = await openai.chat.completions.create({
        messages,
        temperature: 0.5,
        max_tokens: 1000,
        model: 'gpt-4o'
    });

    return response.choices[0].message.content.trim();
}

async function sendToNotion({ name, date, category, attendees, summary }) {
    const url = 'https://api.notion.com/v1/pages';
    const headers = {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
    };

    const body = {
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
            'Meeting name': { title: [{ text: { content: name } }] },
            'Date': { date: { start: date } },
            'Summary': { rich_text: [{ text: { content: summary } }] }
        }
    };

    await axios.post(url, body, { headers });
}

// ===== ✅ Quiz generation endpoint =====

app.use(express.json());

app.post('/generate_quiz', async (req, res) => {
    const { summary } = req.body;
  
    try {
      const quizPrompt = `
        Based on the following meeting summary, generate 10 multiple-choice quiz questions in a strict JSON format. The JSON should contain:
        - A question
        - 3 options (A, B, C)
        - The correct option as "A", "B", or "C"
  
        Format the response strictly as a JSON array like this:
        [
          {
            "question": "What is ...?",
            "optionA": "...",
            "optionB": "...",
            "optionC": "...",
            "correct": "B"
          },
          ...
        ]
  
        DO NOT include any text outside the JSON structure. Just provide the raw JSON.
  
        Meeting Summary:
        ${summary}
      `;
  
      const response = await axios.post(
        `${process.env.AZURE_ENDPOINT}/openai/deployments/${process.env.AZURE_GPT_DEPLOYMENT_ID}/chat/completions?api-version=2024-03-01-preview`,
        {
          messages: [
            { role: 'system', content: 'You generate strict JSON-based multiple choice quizzes.' },
            { role: 'user', content: quizPrompt }
          ],
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.AZURE_API_KEY
          }
        }
      );
  
      // Extract the quiz JSON from the response message
      let quizJson = response.data.choices[0].message.content.trim();
  
      // Clean the JSON response (remove extra conversational text)
      quizJson = quizJson.replace(/^\s*(Sure, I can.*|Here's the quiz:)/, '').trim();
  
      // Try parsing the cleaned JSON response
      const parsedQuiz = JSON.parse(quizJson);
  
      // Log the quiz questions to the terminal
      console.log('Quiz Questions:', parsedQuiz);
  
      // Send the parsed quiz as a response
      res.json({ quiz: parsedQuiz });
  
    } catch (err) {
      console.error('❌ Error generating quiz:', err.message);
      if (err.response) {
        console.error('Error response:', err.response.data);
      }
      res.status(500).json({ error: 'Failed to generate quiz.' });
    }
  });
  
  
  

app.listen(3000, () => {
  console.log(`✅ Server running at http://localhost:3000`);
});
