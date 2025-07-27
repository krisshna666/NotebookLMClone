require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({
    apiKey: process.env.api_key
});

app.use(cors());
app.use(express.json());

let latestFileId = null;
let latestPdfText = null;
const processingStatus = new Map();

//THIS ARRAY IS FOR MAINTAINING PREVIOUS RESPONSES AS WELL------> SRI
let chatHistory = [];

// CHUNKING TEXT FROM PDF --->SRI
function chunkText(text, maxWords = 300) {
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(' '));
    }
    return chunks;
}

//THIS METHOD IS FOR CALCULATING THE CLOSENESS BETWEEN TWO VECTORS ---->SRI
function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val ** 2, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val ** 2, 0));
    return normA && normB ? dot / (normA * normB) : 0;
}

// GETTING THE VECTOR EMBEDDINGS OF THE CHUNKS VIA OPENAI  ---->SRI
async function getEmbeddings(texts) {
    const res = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: texts,
    });
    return res.data.map(obj => obj.embedding);
}

//STORING THE UPLOADED PDF IN MEMORY -----> SRI
async function processPdf(fileId, filePath) {
    try {
        processingStatus.set(fileId, 'processing');
        const buffer = await fs.readFile(filePath);
        const parsed = await pdfParse(buffer);
        latestPdfText = parsed.text;
        latestFileId = fileId;
        processingStatus.set(fileId, 'ready');
        await fs.unlink(filePath);
    } catch (err) {
        processingStatus.set(fileId, 'failed');
        console.error('Error processing PDF:', err);
    }
}

//THIS METHOD IS FOR BREAKING THE UPLOADED PDF TO CHUNKS ---->SRI
app.post('/upload-and-parse', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = req.file.filename;
    latestFileId = fileId;
    const filePath = req.file.path;
    res.json({ message: 'File received, processing in background' });
    processPdf(fileId, filePath);
});


//THIS METHOD IS FOR SENDING PROMPTS TO THE GPT TO GET APT RESPONSES BASED ON THE UPLOADED PDF
app.post('/ask', async (req, res) => {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid "question" in request body' });
    }

    if (!latestPdfText) {
        return res.status(400).json({ error: 'No PDF has been uploaded or processed yet' });
    }

    try {
        chatHistory.push({ role: 'user', content: question });

        const textChunks = chunkText(latestPdfText);
        const embeddings = await getEmbeddings(textChunks);

        const embedRes = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: question,
        });

        const questionEmbedding = embedRes.data[0].embedding;

        const scored = textChunks.map((text, idx) => ({
            text,
            score: cosineSimilarity(questionEmbedding, embeddings[idx]),
        }));

        const topChunks = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(c => c.text)
            .join('\n\n');

        const prompt = `
Use the context below to answer the question clearly and concisely. Also remember the previous questions by the user and answer accordingly.
Assume that this context comes from a document.
Context:
${topChunks}

Question:
${question}

Answer:
`.trim();
        chatHistory.push({ role: 'system', content: prompt });

        const answerRes = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: chatHistory,
        });

        const answer = answerRes.choices[0].message.content;
        chatHistory.push({ role: 'assistant', content: answer });

        res.json({ answer });
    } catch (err) {
        console.error('Error generating answer:', err);

        res.status(500).json({ answer: 'Failed to generate answer', details: err.message });
    }
});

app.get('/', (_, res) => res.send('✅ PDF Q&A API is running'));

// STARTING THE SERVER  ---->SRI
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
