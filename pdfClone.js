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

const CACHE_DIR = path.join(__dirname, 'cache');
fs.ensureDirSync(CACHE_DIR);

let latestFileId = null;
const processingStatus = new Map();

function chunkText(text, maxWords = 300) {
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(' '));
    }
    return chunks;
}

function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val ** 2, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val ** 2, 0));
    return normA && normB ? dot / (normA * normB) : 0;
}

async function getEmbeddings(texts) {
    const res = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: texts,
    });
    return res.data.map(obj => obj.embedding);
}

async function processPdf(fileId, filePath) {
    try {
        processingStatus.set(fileId, 'processing');
        const buffer = await fs.readFile(filePath);
        const parsed = await pdfParse(buffer);

        const textChunks = chunkText(parsed.text);
        const embeddings = await getEmbeddings(textChunks);

        const results = textChunks.map((text, idx) => ({
            text,
            embedding: embeddings[idx],
        }));

        const cacheFile = path.join(CACHE_DIR, `${fileId}.json`);
        await fs.writeJSON(cacheFile, results);

        processingStatus.set(fileId, 'ready');
        latestFileId = fileId;

        await fs.unlink(filePath);
    } catch (err) {
        processingStatus.set(fileId, 'failed');
    }
}

app.post('/upload', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = req.file.filename;
    latestFileId = fileId;
    const filePath = req.file.path;

    res.json({ message: 'File received, processing in background' });

    const cacheFile = path.join(CACHE_DIR, `${fileId}.json`);
    if (await fs.pathExists(cacheFile)) {
        processingStatus.set(fileId, 'ready');
        latestFileId = fileId;
        await fs.unlink(filePath);
        return;
    }

    processPdf(fileId, filePath);
});

app.get('/status', (_, res) => {
    if (!latestFileId) return res.json({ status: 'no_file_uploaded' });
    const status = processingStatus.get(latestFileId) || 'not_found';
    res.json({ status });
});

app.post('/ask', async (req, res) => {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid "question" in request body' });
    }

    if (!latestFileId) {
        return res.status(400).json({ error: 'No PDF has been uploaded yet' });
    }

    const cacheFile = path.join(CACHE_DIR, `${latestFileId}.json`);
    if (!(await fs.pathExists(cacheFile))) {
        return res.status(400).json({ error: 'PDF is still processing or failed' });
    }

    try {
        const chunks = await fs.readJSON(cacheFile);
        if (!Array.isArray(chunks) || chunks.length === 0) {
            return res.status(500).json({ error: 'No content found in the processed PDF' });
        }

        const embedRes = await openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: question,
        });

        const questionEmbedding = embedRes.data[0].embedding;

        const scored = chunks.map(({ text, embedding }) => ({
            text,
            score: cosineSimilarity(questionEmbedding, embedding),
        }));

        const topChunks = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(c => c.text)
            .join('\n\n');

        const prompt = `
Use the context below to answer the question clearly and concisely.

Context:
${topChunks}

Question:
${question}

Answer:
`.trim();

        const answerRes = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
        });

        const answer = answerRes.choices[0].message.content;
        res.json({ answer });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate answer' });
    }
});

app.get('/', (_, res) => res.send('✅ PDF Q&A API is running'));

app.listen(port, () => {
    console.log('Server listening at the port');
});
