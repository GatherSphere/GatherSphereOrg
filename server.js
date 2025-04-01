const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
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
    const { subject, content, tags, sphere_id } = req.body;
    const author_id = req.user.id;
    const created_at = new Date().toISOString();

    // Check if user is a member of the sphere
    db.get(
        "SELECT * FROM sphere_members WHERE sphere_id = ? AND user_id = ?",
        [sphere_id, author_id],
        (err, member) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!member) {
                return res.status(403).json({ error: "You must be a member of the sphere to post" });
            }
            
            db.run(
                "INSERT INTO posts (subject, content, author_id, created_at, views, replies, tags, sphere_id) VALUES (?, ?, ?, ?, 0, 0, ?, ?)",
                [subject, content, author_id, created_at, tags, sphere_id],
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
         email_public, location_public, birthday_public, spheres_public, profile_picture
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

    const { username, email, bio, location, birthday, email_public, location_public, birthday_public, spheres_public } = req.body;
    
    // If username is provided, check if it's already taken
    if (username) {
        db.get("SELECT id FROM users WHERE username = ? AND id != ?", [username, req.params.id], (err, existingUser) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (existingUser) {
                return res.status(400).json({ error: "Username already taken" });
            }
            
            // Continue with update if username is available
            updateUserProfile();
        });
    } else {
        // No username change, proceed with update
        updateUserProfile();
    }
    
    function updateUserProfile() {
        db.run(
            `UPDATE users SET 
             username = COALESCE(?, username),
             email = COALESCE(?, email),
             bio = COALESCE(?, bio),
             location = COALESCE(?, location),
             birthday = COALESCE(?, birthday),
             email_public = COALESCE(?, email_public),
             location_public = COALESCE(?, location_public),
             birthday_public = COALESCE(?, birthday_public),
             spheres_public = COALESCE(?, spheres_public)
             WHERE id = ?`,
            [username, email, bio, location, birthday, email_public, location_public, birthday_public, spheres_public, req.params.id],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: "Profile updated successfully" });
            }
        );
    }
});

// Profile picture upload endpoint
app.post('/api/user/:id/profile-picture', authenticateToken, upload.single('profile_picture'), (req, res) => {
    // Verify user is updating their own profile
    if (req.user.id != req.params.id) {
        return res.status(403).json({ error: "Unauthorized access" });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    
    // Save the file path to the database
    const filePath = `/uploads/${req.file.filename}`;
    
    db.run(
        "UPDATE users SET profile_picture = ? WHERE id = ?",
        [filePath, req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ 
                message: "Profile picture updated successfully",
                filePath: filePath
            });
        }
    );
});

// Get all spheres
app.get('/api/spheres', (req, res) => {
    db.all(
        `SELECT spheres.*, users.username as creator_name,
         COUNT(DISTINCT sphere_members.user_id) as member_count,
         COUNT(DISTINCT posts.id) as post_count,
         MAX(posts.created_at) as last_post_date
         FROM spheres
         LEFT JOIN users ON spheres.creator_id = users.id
         LEFT JOIN sphere_members ON spheres.id = sphere_members.sphere_id
         LEFT JOIN posts ON spheres.id = posts.sphere_id
         GROUP BY spheres.id
         ORDER BY spheres.created_at DESC`,
        (err, spheres) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(spheres);
        }
    );
});

// Get specific sphere by ID
app.get('/api/spheres/:id', (req, res) => {
    const sphereId = req.params.id;
    db.get(
        `SELECT spheres.*, users.username as creator_name,
         COUNT(DISTINCT sphere_members.user_id) as member_count
         FROM spheres
         LEFT JOIN users ON spheres.creator_id = users.id
         LEFT JOIN sphere_members ON spheres.id = sphere_members.sphere_id
         WHERE spheres.id = ?
         GROUP BY spheres.id`,
        [sphereId],
        (err, sphere) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            if (!sphere) {
                res.status(404).json({ error: "Sphere not found" });
                return;
            }
            res.json(sphere);
        }
    );
});

// Protected route - Create sphere
app.post('/api/spheres', authenticateToken, (req, res) => {
    const { name, description, tags } = req.body;
    const creator_id = req.user.id;
    const created_at = new Date().toISOString();

    db.run(
        "INSERT INTO spheres (name, description, created_at, creator_id, tags) VALUES (?, ?, ?, ?, ?)",
        [name, description, created_at, creator_id, tags],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Add creator as a member with admin role
            db.run(
                "INSERT INTO sphere_members (sphere_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
                [this.lastID, creator_id, 'admin', created_at],
                (err) => {
                    if (err) {
                        console.error('Error adding creator as member:', err);
                    }
                }
            );
            
            res.json({ 
                message: "Sphere created successfully", 
                sphereId: this.lastID 
            });
        }
    );
});

// Protected route - Update sphere
app.put('/api/spheres/:id', authenticateToken, (req, res) => {
    const sphereId = req.params.id;
    const { name, description, tags } = req.body;
    
    // Verify user is admin of the sphere
    db.get(
        "SELECT role FROM sphere_members WHERE sphere_id = ? AND user_id = ?",
        [sphereId, req.user.id],
        (err, member) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!member || member.role !== 'admin') {
                return res.status(403).json({ error: "Only sphere admins can update sphere details" });
            }
            
            db.run(
                `UPDATE spheres SET 
                 name = COALESCE(?, name),
                 description = COALESCE(?, description),
                 tags = COALESCE(?, tags)
                 WHERE id = ?`,
                [name, description, tags, sphereId],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    if (this.changes === 0) {
                        return res.status(404).json({ error: "Sphere not found" });
                    }
                    res.json({ message: "Sphere updated successfully" });
                }
            );
        }
    );
});

// Get posts for a specific sphere
app.get('/api/spheres/:id/posts', (req, res) => {
    const sphereId = req.params.id;
    db.all(
        `SELECT posts.*, users.username as author_name 
         FROM posts 
         LEFT JOIN users ON posts.author_id = users.id 
         WHERE posts.sphere_id = ?
         ORDER BY posts.created_at DESC`,
        [sphereId],
        (err, posts) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(posts);
        }
    );
});

// Protected route - Join a sphere
app.post('/api/spheres/:id/members', authenticateToken, (req, res) => {
    const sphereId = req.params.id;
    const userId = req.user.id;
    const joined_at = new Date().toISOString();
    
    // Check if user is already a member
    db.get(
        "SELECT * FROM sphere_members WHERE sphere_id = ? AND user_id = ?",
        [sphereId, userId],
        (err, member) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (member) {
                return res.status(400).json({ error: "User is already a member of this sphere" });
            }
            
            db.run(
                "INSERT INTO sphere_members (sphere_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
                [sphereId, userId, 'member', joined_at],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ message: "Successfully joined sphere" });
                }
            );
        }
    );
});

// Get spheres a user has joined
app.get('/api/user/:id/spheres', (req, res) => {
    const userId = req.params.id;
    
    // If user profile is private, only allow self or admin
    db.get("SELECT spheres_public FROM users WHERE id = ?", [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        // If spheres aren't public and user isn't requesting their own spheres
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        let isOwnProfile = false;
        
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                isOwnProfile = decoded.id == userId;
            } catch (e) {
                // Invalid token, continue as if not authenticated
            }
        }
        
        if (!user.spheres_public && !isOwnProfile) {
            return res.status(403).json({ error: "This user's spheres are private" });
        }
        
        db.all(
            `SELECT spheres.*, sphere_members.role, sphere_members.joined_at
             FROM spheres
             JOIN sphere_members ON spheres.id = sphere_members.sphere_id
             WHERE sphere_members.user_id = ?
             ORDER BY sphere_members.joined_at DESC`,
            [userId],
            (err, spheres) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json(spheres);
            }
        );
    });
});

// Search functionality
app.get('/api/search', (req, res) => {
    const query = `%${req.query.q}%`; // Add wildcards for LIKE query
    const filter = req.query.filter || 'everything';
    
    let sql, params;
    
    switch(filter) {
        case 'forum':
            sql = `SELECT 'sphere' as type, id, name as title, description as content, NULL as author_name, created_at 
                   FROM spheres WHERE name LIKE ? OR tags LIKE ?`;
            params = [query, query];
            break;
            
        case 'post':
            sql = `SELECT 'post' as type, posts.id, posts.subject as title, posts.content, users.username as author_name, posts.created_at 
                   FROM posts JOIN users ON posts.author_id = users.id 
                   WHERE posts.subject LIKE ?`;
            params = [query];
            break;
            
        case 'description':
            sql = `SELECT 'sphere' as type, id, name as title, description as content, NULL as author_name, created_at 
                   FROM spheres WHERE description LIKE ?`;
            params = [query];
            break;
            
        case 'user':
            sql = `SELECT 'user' as type, id, username as title, bio as content, NULL as author_name, created_at 
                   FROM users WHERE username LIKE ?`;
            params = [query];
            break;
            
        case 'everything':
        default:
            sql = `SELECT 'sphere' as type, id, name as title, description as content, NULL as author_name, created_at 
                   FROM spheres WHERE name LIKE ? OR description LIKE ? OR tags LIKE ?
                   UNION
                   SELECT 'post' as type, posts.id, posts.subject as title, posts.content, users.username as author_name, posts.created_at 
                   FROM posts JOIN users ON posts.author_id = users.id 
                   WHERE posts.subject LIKE ? OR posts.content LIKE ? OR posts.tags LIKE ?
                   UNION
                   SELECT 'user' as type, id, username as title, bio as content, NULL as author_name, created_at 
                   FROM users WHERE username LIKE ? OR bio LIKE ?
                   ORDER BY created_at DESC
                   LIMIT 50`;
            params = [query, query, query, query, query, query, query, query];
            break;
    }
    
    db.all(sql, params, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Protected route - Like a post
app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
    const postId = req.params.id;
    const userId = req.user.id;
    const now = new Date().toISOString();
    
    // Check if post exists
    db.get("SELECT * FROM posts WHERE id = ?", [postId], (err, post) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }
        
        // Check if user already liked this post
        db.get(
            "SELECT * FROM post_likes WHERE post_id = ? AND user_id = ?", 
            [postId, userId],
            (err, like) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                if (like) {
                    // User already liked this post - unlike it
                    db.run(
                        "DELETE FROM post_likes WHERE post_id = ? AND user_id = ?",
                        [postId, userId],
                        (err) => {
                            if (err) {
                                return res.status(500).json({ error: err.message });
                            }
                            
                            // Decrement post likes count
                            db.run(
                                "UPDATE posts SET likes = likes - 1 WHERE id = ?",
                                [postId],
                                function(err) {
                                    if (err) {
                                        return res.status(500).json({ error: err.message });
                                    }
                                    
                                    // Return the updated likes count
                                    db.get(
                                        "SELECT likes FROM posts WHERE id = ?",
                                        [postId],
                                        (err, result) => {
                                            if (err) {
                                                return res.status(500).json({ error: err.message });
                                            }
                                            
                                            res.json({ 
                                                likes: result.likes,
                                                liked: false 
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                } else {
                    // User hasn't liked this post yet - add the like
                    db.run(
                        "INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)",
                        [postId, userId, now],
                        (err) => {
                            if (err) {
                                return res.status(500).json({ error: err.message });
                            }
                            
                            // Increment post likes count
                            db.run(
                                "UPDATE posts SET likes = likes + 1 WHERE id = ?",
                                [postId],
                                function(err) {
                                    if (err) {
                                        return res.status(500).json({ error: err.message });
                                    }
                                    
                                    // Return the updated likes count
                                    db.get(
                                        "SELECT likes FROM posts WHERE id = ?",
                                        [postId],
                                        (err, result) => {
                                            if (err) {
                                                return res.status(500).json({ error: err.message });
                                            }
                                            
                                            res.json({ 
                                                likes: result.likes,
                                                liked: true 
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            }
        );
    });
});

// Get members of a specific sphere
app.get('/api/spheres/:id/members', authenticateToken, (req, res) => {
    const sphereId = req.params.id;
    
    db.all(
        `SELECT sphere_members.*, users.username 
         FROM sphere_members 
         JOIN users ON sphere_members.user_id = users.id 
         WHERE sphere_id = ?`,
        [sphereId],
        (err, members) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(members);
        }
    );
});

// Start server
app.listen(port, () => {
    console.log(`Server is up on http://localhost:${port}`);
});
