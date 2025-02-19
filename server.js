const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 3000;

// JWT secret key (in production, use environment variable)
const JWT_SECRET = 'your-secret-key';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Authentication required" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "Invalid or expired token" });
        }
        req.user = user;
        next();
    });
};

// Serve static files
app.use(express.static(path.join(__dirname, '/')));
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Could not Could notct totabase', er);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Index.html'));
});

// Get all posts
app.get('/api/posts', (req, res) => {
    db.all(
        `SELECT posts.*, users.username as author_name 
         FROM posts 
         LEFT JOIN users ON posts.author_id = users.id 
         ORDER BY posts.created_at DESC`,
        (err, posts) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(posts);
        }
    );
});

// Get specific post by ID
app.get('/api/posts/:id', (req, res) => {
    const postId = req.params.id;
    
    // First, increment the view count
    db.run(
        "UPDATE posts SET views = views + 1 WHERE id = ?",
        [postId],
        (err) => {
            if (err) {
                console.error('Error updating view count:', err);
            }
            
            // Then fetch the updated post
            db.get(
                `SELECT posts.*, users.username as author_name 
                 FROM posts 
                 LEFT JOIN users ON posts.author_id = users.id 
                 WHERE posts.id = ?`,
                [postId],
                (err, post) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    if (!post) {
                        res.status(404).json({ error: "Post not found" });
                        return;
                    }
                    res.json(post);
                }
            );
        }
    );
});

// Protected route - Create post
app.post('/api/posts', authenticateToken, (req, res) => {
    const { subject, content, tags } = req.body;
    const author_id = req.user.id;
    const created_at = new Date().toISOString();

    db.run(
        "INSERT INTO posts (subject, content, author_id, created_at, views, replies, tags) VALUES (?, ?, ?, ?, 0, 0, ?)",
        [subject, content, author_id, created_at, tags],
        function(err) {
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

// Get replies for a specific post
app.get('/api/posts/:id/replies', (req, res) => {
    const postId = req.params.id;
    db.all(
        `SELECT replies.*, users.username as author_name 
         FROM replies 
         LEFT JOIN users ON replies.author_id = users.id 
         WHERE replies.post_id = ? 
         ORDER BY replies.created_at ASC`,
        [postId],
        (err, replies) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(replies);
        }
    );
});

// Protected route - Add reply
app.post('/api/posts/:id/replies', authenticateToken, (req, res) => {
    const postId = req.params.id;
    const { content } = req.body;
    const author_id = req.user.id;
    const created_at = new Date().toISOString();

    db.run(
        "INSERT INTO replies (post_id, author_id, content, created_at) VALUES (?, ?, ?, ?)",
        [postId, author_id, content, created_at],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Update the replies count in the posts table
            db.run(
                "UPDATE posts SET replies = replies + 1 WHERE id = ?",
                [postId],
                function(err) {
                    if (err) {
                        console.error('Error updating reply count:', err);
                    }
                }
            );

            res.json({ 
                message: "Reply added successfully", 
                replyId: this.lastID 
            });
        }
    );
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

// Login route with JWT
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get(
        "SELECT * FROM users WHERE username = ?",
        [username],
        async (err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!user) {
                return res.status(401).json({ error: "Invalid credentials" });
            }
            
            try {
                const match = await bcrypt.compare(password, user.password);
                if (!match) {
                    return res.status(401).json({ error: "Invalid credentials" });
                }

                // Create JWT token
                const token = jwt.sign(
                    { 
                        id: user.id, 
                        username: user.username 
                    }, 
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.json({ 
                    message: "Login successful",
                    token,
                    user: {
                        id: user.id,
                        username: user.username
                    }
                });
            } catch (error) {
                res.status(500).json({ error: "Server error" });
            }
        }
    );
});

// Protected route example - Get user profile
app.get('/api/user/:id', authenticateToken, (req, res) => {
    // Verify user is accessing their own profile or is admin
    if (req.user.id != req.params.id) {
        return res.status(403).json({ error: "Unauthorized access" });
    }

    db.get(
        `SELECT id, username, email, bio, location, birthday, created_at, 
         email_public, location_public, birthday_public, spheres_public 
         FROM users WHERE id = ?`,
        [req.params.id],
        (err, user) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            if (!user) {
                res.status(404).json({ error: "User not found" });
                return;
            }
            res.json(user);
        }
    );
});

// Protected route - Update user profile
app.put('/api/user/:id', authenticateToken, (req, res) => {
    // Verify user is updating their own profile
    if (req.user.id != req.params.id) {
        return res.status(403).json({ error: "Unauthorized access" });
    }

    const { email, bio, location, birthday, email_public, location_public, birthday_public, spheres_public } = req.body;
    
    db.run(
        `UPDATE users SET 
         email = COALESCE(?, email),
         bio = COALESCE(?, bio),
         location = COALESCE(?, location),
         birthday = COALESCE(?, birthday),
         email_public = COALESCE(?, email_public),
         location_public = COALESCE(?, location_public),
         birthday_public = COALESCE(?, birthday_public),
         spheres_public = COALESCE(?, spheres_public)
         WHERE id = ?`,
        [email, bio, location, birthday, email_public, location_public, birthday_public, spheres_public, req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: "User not found" });
            }
            res.json({ message: "Profile updated successfully" });
        }
    );
});

// Start server
app.listen(port, () => {
    console.log(`Server is up on http://localhost:${port}`);
});
