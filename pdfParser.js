const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
const router = express.Router();

const upload = multer({ dest: 'uploads/' });

//THIS IS THE ROUTE HANDLER FOR UPLOADING AND PARSING THE PDF ---->SRI
router.post('/upload-and-parse', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = req.file.filename;
    const filePath = req.file.path;
    res.json({ message: 'File received, processing in background' });

    try {
        const buffer = await fs.readFile(filePath);
        const parsed = await pdfParse(buffer);
        // SAVED THE PARSED TEXT TO A GLOBAL VARIABLE ---SRI
        global.latestPdfText = parsed.text;
        global.latestFileId = fileId;
        await fs.unlink(filePath);
    } catch (err) {
        console.error('Error processing PDF:', err);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

module.exports = router;
