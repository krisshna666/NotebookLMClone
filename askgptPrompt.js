const express = require('express');
const { OpenAI } = require('openai');
const router = express.Router();

const openai = new OpenAI({ apiKey: process.env.api_key });
let chatHistory = [];

//THIS METHOD IS USED TO BREAK THE PDF INTO CHUNKS OF WORDS ----->SRI
function chunkText(text, maxWords = 300) {
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(' '));
    }
    return chunks;
}

//THIS IS USED TO CHECK THE CLOSENESS OF THE VECTOR PDF DATA ----->SRI
function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val ** 2, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val ** 2, 0));
    return normA && normB ? dot / (normA * normB) : 0;
}

//GETTING THE VECTOR EMBEDDING FROM THE BROKEN CHUNKS OF TEXT ---->SRI
async function getEmbeddings(texts) {
    const res = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: texts,
    });
    return res.data.map(obj => obj.embedding);
}


//THIS IS THE ROUTE HANDLER TO HANDLE USER QUESTIONS AND SEND GPT RESPONSES BACK ----->sRI
router.post('/ask', async (req, res) => {
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
        console.error('Error generating answer:', err); // Log the error to console for debugging
        res.status(500).json({ answer: 'Failed to generate answer', details: err.message });
    }
});


module.exports = router;
