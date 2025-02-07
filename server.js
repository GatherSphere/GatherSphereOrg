const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// Enable JSON/body parsing in Express
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Index.html'));
});

// Return posts from SQLite database
app.get('/api/posts', (req, res) => {
  db.all('SELECT * FROM posts', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Signup route
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  // TODO: Add validations
  const createdAt = new Date().toISOString();
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      "INSERT INTO users (username, email, password, created_at) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, createdAt],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Signup successful", userId: this.lastID });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  // TODO Add validations 
  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const match = await bcrypt.compare(password, row.password);
      if (!match) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      // ...token or session handling...
      res.json({ message: "Login successful", user: row.username });
    }
  );
});

// Create new post route
app.post('/api/posts', (req, res) => {
  const { subject, content, tags } = req.body;
  // TODO: Get real author_id from authentication
  const author_id = 1; // Temporary default author
  const created_at = new Date().toISOString();
  
  db.run(
    "INSERT INTO posts (subject, content, author_id, replies, views, created_at) VALUES (?, ?, ?, 0, 0, ?)",
    [subject, content, author_id, created_at],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ 
        message: "Post created successfully", 
        postId: this.lastID 
      });
    }
  );
});

// Start server
app.listen(port, () => {
  console.log(`Server is up on http://localhost:${port}`);
});
