// server.js
// This is the secure backend proxy that communicates with Salesforce.

const express = require('express');
const jsforce = require('jsforce');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// --- Middleware ---
// Set up CORS to allow requests from the Vercel frontend or localhost
const allowedOrigins = [
  'http://localhost:3000',
  // Add your Vercel production URL here after deployment for better security
  // e.g., 'https://your-project-name.vercel.app' 
];
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // If a dynamic Vercel preview deployment, allow it
    if (origin.includes('vercel.app')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json()); // Allow to parse JSON in request bodies

// --- Salesforce Connection ---
const conn = new jsforce.Connection({
  oauth2: {
    loginUrl: process.env.SF_LOGIN_URL,
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET,
  },
});

// Log in to Salesforce once when the server starts
conn.login(process.env.SF_USERNAME, process.env.SF_PASSWORD, (err, userInfo) => {
  if (err) {
    return console.error('Salesforce login error:', err);
  }
  console.log('Successfully connected to Salesforce as user ID:', userInfo.id);
  console.log('Org ID:', userInfo.organizationId);
});

// --- Gemini AI Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });


// --- API Routes (all prefixed with /api/ in vercel.json) ---

app.get('/api/healthcheck', (req, res) => {
  res.status(200).send('OK');
});

// GET KNOWLEDGE DATA CATEGORY HIERARCHY
app.get('/api/knowledge/categories', async (req, res) => {
  try {
    const dataCategoryGroups = await conn.knowledge.getDataCategoryGroups(['Knowledge']);
    const categoryGroup = dataCategoryGroups[0]; // Assuming 'Knowledge' is your main group
    const tree = await conn.knowledge.getCategoryTree(categoryGroup.name, { depth: 4 });
    res.json(tree);
  } catch (err) {
    console.error('Error fetching knowledge categories:', err.message);
    res.status(500).json({ error: 'Failed to fetch knowledge categories' });
  }
});

// GET ARTICLES FOR A SPECIFIC CATEGORY
app.get('/api/knowledge/articles/:categoryName', async (req, res) => {
  const { categoryName } = req.params;
  try {
    const query = `
      SELECT Id, Title, UrlName, Summary 
      FROM Knowledge__kav 
      WHERE PublishStatus='Online' AND Language='en_US' 
      AND DataCategorySelections.Knowledge.at('${categoryName}')
      ORDER BY LastPublishedDate DESC
      LIMIT 20
    `;
    const result = await conn.query(query);
    res.json(result.records);
// Endpoint to get open cases for a specific contact email
app.get('/api/cases/:email', async (req, res) => {
    if (!conn.accessToken) {
        return res.status(401).json({ error: 'Salesforce not connected' });
    }
    const { email } = req.params;

    // --- QUERY MODIFICATION ---
    // Previously, this query used "IsClosed = false".
    // We are changing it to look at the Status field directly, which is more flexible.
    // This will now fetch any case that does not have the status of 'Closed'.
    // You can customize this list, e.g., AND Status NOT IN ('Closed', 'Resolved', 'Cancelled')
    const soql = `
      SELECT Id, CaseNumber, Subject, Description, Status, CreatedDate 
      FROM Case 
      WHERE Contact.Email = '${email}' AND Status != 'Closed'
      ORDER BY CreatedDate DESC
    `;

    try {
        const result = await conn.query(soql);
        res.json(result.records);
    } catch (err) {
        console.error('Error fetching article:', urlName, err.message);
        res.status(500).json({ error: `Failed to fetch article ${urlName}` });
    }
});

// GET OPEN CASES FOR A CONTACT EMAIL
app.get('/api/cases/:email', async (req, res) => {
  const { email } = req.params;
  if (!email) {
    return res.status(400).json({ error: 'Email parameter is required.' });
  }
  try {
    const query = `
      SELECT Id, CaseNumber, Subject, Status, CreatedDate, Description 
      FROM Case 
      WHERE ContactEmail = '${email}' AND IsClosed = false
      ORDER BY CreatedDate DESC
    `;
    const result = await conn.query(query);
    res.json(result.records);
  } catch (err) {
    console.error('Error fetching cases for email:', email, err.message);
    res.status(500).json({ error: `Failed to fetch cases for email ${email}` });
  }
});

// POST A REPLY (CASE COMMENT) TO A CASE
app.post('/api/cases/:caseId/reply', async (req, res) => {
    const { caseId } = req.params;
    const { commentBody, isPublic } = req.body;

    if (!commentBody) {
        return res.status(400).json({ error: 'commentBody is required.' });
    }
    
    try {
        const result = await conn.sobject('CaseComment').create({
            ParentId: caseId,
            CommentBody: commentBody,
            IsPublished: isPublic || false, // Make comment visible to contact if portal is enabled
        });
        res.status(201).json(result);
    } catch (err) {
        console.error('Error posting case comment:', err.message);
        res.status(500).json({ error: 'Failed to post reply' });
    }
});

// SEARCH KNOWLEDGE ARTICLES (WITH GEMINI)
app.post('/api/search', async (req, res) => {
    const { searchTerm } = req.body;
    if (!searchTerm) {
        return res.status(400).json({ error: 'searchTerm is required.' });
    }

    try {
        // 1. Rudimentary search in Salesforce to get candidate articles
        const soslQuery = `
          FIND {*${searchTerm}*} IN ALL FIELDS 
          RETURNING Knowledge__kav(Id, Title, Summary, UrlName WHERE PublishStatus='Online' AND Language='en_US' LIMIT 10)
        `;
        const soslResult = await conn.search(soslQuery);
        const articles = soslResult.searchRecords;

        if (!articles || articles.length === 0) {
            return res.json({ answer: "I couldn't find any articles related to your search.", sources: [] });
        }
        
        // 2. Prepare context for Gemini
        const context = articles.map(art => `Title: ${art.Title}\nSummary: ${art.Summary}`).join('\n\n---\n\n');
        
        // 3. Call Gemini API
        const prompt = `
            Based on the following knowledge base articles, please answer the user's question. 
            Provide a concise, helpful answer and cite the titles of the articles you used.
            If the articles don't contain the answer, say that you couldn't find an answer in the knowledge base.

            ARTICLES:
            ---
            ${context}
            ---

            USER QUESTION: "${searchTerm}"

            ANSWER:
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        res.json({ answer: text, sources: articles });

    } catch (err) {
        console.error('Error in semantic search:', err.message);
        res.status(500).json({ error: 'Failed to perform search' });
    }
});

// When running on Vercel, the file itself is the server.
// For local development, we need to tell it to listen on a port.
if (process.env.NODE_ENV !== 'production') {
  const port = 3001;
  app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
  });
}

module.exports = app;


