// require('dotenv').config();
// const express = require('express');
// const multer = require('multer');
// const cors = require('cors');
// const fs = require('fs-extra');
// const path = require('path');
// const pdfParse = require('pdf-parse');
// const { OpenAI } = require('openai');

// const app = express();
// const port = process.env.PORT || 3000;
// const upload = multer({ dest: 'uploads/' });

// const openai = new OpenAI({
//     apiKey: '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'
// });

// app.use(cors());
// app.use(express.json());

// const CACHE_DIR = path.join(__dirname, 'cache');
// fs.ensureDirSync(CACHE_DIR);

// let latestFileId = null; // track latest uploaded file
// const fileCache = new Map();
// const processingStatus = new Map();

// // Utility: chunk PDF text
// function chunkText(text, maxWords = 300) {
//     const words = text.split(/\s+/);
//     const chunks = [];
//     for (let i = 0; i < words.length; i += maxWords) {
//         chunks.push(words.slice(i, i + maxWords).join(' '));
//     }
//     return chunks;
// }

// // Utility: cosine similarity
// function cosineSimilarity(a, b) {
//     const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
//     const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
//     const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
//     return normA && normB ? dot / (normA * normB) : 0;
// }

// // Batch embeddings
// async function getEmbeddingsBatch(texts, batchSize = 20) {
//     const results = [];
//     for (let i = 0; i < texts.length; i += batchSize) {
//         const batch = texts.slice(i, i + batchSize);
//         try {
//             const res = await openai.embeddings.create({
//                 model: 'text-embedding-ada-002',
//                 input: batch,
//             });
//             results.push(...res.data.map(e => e.embedding));
//         } catch (err) {
//             console.error('Embedding batch failed:', err.message);
//             results.push(...Array(batch.length).fill(null));
//         }
//     }
//     return results;
// }

// // PDF processing
// async function processPdf(fileId, filePath, cacheFile) {
//     try {
//         processingStatus.set(fileId, 'processing');

//         const buffer = await fs.readFile(filePath);
//         const data = await pdfParse(buffer);
//         if (!data.text.trim()) throw new Error('No text in PDF');

//         const allChunks = chunkText(data.text);
//         const embeddings = await getEmbeddingsBatch(allChunks, 20);

//         const results = allChunks
//             .map((text, i) => ({ text, embedding: embeddings[i] }))
//             .filter(({ embedding }) => embedding !== null);

//         await fs.writeJSON(cacheFile, results);
//         fileCache.set(fileId, results);
//         processingStatus.set(fileId, 'ready');
//         await fs.unlink(filePath);
//     } catch (err) {
//         console.error('PDF Processing Error:', err.message);
//         processingStatus.set(fileId, 'failed');
//     }
// }

// // Upload API
// app.post('/upload', upload.single('pdf'), async (req, res) => {
//     if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

//     const fileId = req.file.filename;
//     latestFileId = fileId;
//     const filePath = req.file.path;
//     const cacheFile = path.join(CACHE_DIR, `${fileId}.json`);

//     res.json({ message: 'Upload received' });

//     if (await fs.pathExists(cacheFile)) {
//         const cached = await fs.readJSON(cacheFile);
//         fileCache.set(fileId, cached);
//         processingStatus.set(fileId, 'ready');
//         await fs.unlink(filePath);
//         return;
//     }

//     processPdf(fileId, filePath, cacheFile);
// });

// // Status API
// app.get('/status', (req, res) => {
//     if (!latestFileId) return res.json({ status: 'no_upload' });
//     const status = processingStatus.get(latestFileId) || 'not_found';
//     res.json({ status });
// });

// // Ask API (no fileId needed)
// app.post('/ask', async (req, res) => {
//     const { question } = req.body;
//     if (!question) return res.status(400).json({ error: 'Missing question' });

//     if (!latestFileId) return res.status(400).json({ error: 'No PDF uploaded' });

//     const cacheFile = path.join(CACHE_DIR, `${latestFileId}.json`);
//     if (!(await fs.pathExists(cacheFile))) {
//         return res.status(404).json({ error: 'No processed PDF found' });
//     }

//     const chunks = await fs.readJSON(cacheFile);

//     try {
//         const qEmbed = await openai.embeddings.create({
//             model: 'text-embedding-ada-002',
//             input: question,
//         });

//         const questionEmbedding = qEmbed.data[0].embedding;

//         const topChunks = chunks.map(({ text, embedding }) => ({
//             text,
//             score: cosineSimilarity(questionEmbedding, embedding),
//         }))
//             .sort((a, b) => b.score - a.score)
//             .slice(0, 5)
//             .map(c => c.text)
//             .join('\n\n');

//         const prompt = `
// Use the context below to answer the question.

// Context:
// ${topChunks}

// Question:
// ${question}

// Answer:
// `.trim();

//         const response = await openai.chat.completions.create({
//             model: 'gpt-3.5-turbo',
//             messages: [{ role: 'user', content: prompt }],
//         });

//         res.json({ answer: response.choices[0].message.content });
//     } catch (err) {
//         console.error('Error answering question:', err.message);
//         res.status(500).json({ error: 'Failed to generate answer' });
//     }
// });

// // Root API
// app.get('/', (_, res) => res.send('🚀 PDF Q&A API is running'));

// app.listen(port, () => console.log(`🚀 Listening on http://localhost:${port}`));
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
    apiKey: '' // my personal repo is private so having this key does not render any damage on my resources.
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
        console.log(fileId, 'fileid');
        latestFileId = fileId;

        await fs.unlink(filePath);
    } catch (err) {
        console.error('Error processing PDF:', err);
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
        console.error('Error generating answer:', err.message);
        res.status(500).json({ error: 'Failed to generate answer' });
    }
});

app.get('/', (_, res) => res.send('✅ PDF Q&A API is running'));

app.listen(port, () => {
    console.log(`🚀 Server listening at http://localhost:${port}`);
});
