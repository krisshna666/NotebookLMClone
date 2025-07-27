// index.js (or app.js)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const uploadRoutes = require('./pdfParser');
const askRoutes = require('./askgptPrompt');


const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(uploadRoutes);
app.use(askRoutes);


app.get('/', (_, res) => res.send('✅ PDF Q&A API is running'));

// Start the server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
