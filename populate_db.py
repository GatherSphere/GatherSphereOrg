import sqlite3
from faker import Faker
import random
from datetime import datetime
import os
import bcrypt

fake = Faker()
# REPLACE THIS WITH YOUR DB FILE
DB_FILE = 'database.db'

def get_connection():
    """
    Establishes a connection to the SQLite database.
    Creates the database file if it doesn't exist.
    """
    conn = sqlite3.connect(DB_FILE)
    # Enable foreign key support
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def create_tables():
    """
    Creates the necessary tables in the database if they don't already exist.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Users table with privacy settings as per design document
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            bio TEXT,
            location TEXT,
            birthday TEXT,
            created_at TEXT NOT NULL,
            email_public BOOLEAN DEFAULT 0,
            location_public BOOLEAN DEFAULT 0,
            birthday_public BOOLEAN DEFAULT 0,
            spheres_public BOOLEAN DEFAULT 1,
            posts_public BOOLEAN DEFAULT 1,
            profile_picture TEXT
        );
    """)

    # Posts table with sphere_id to associate posts with spheres
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL,
            content TEXT NOT NULL,
            author_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            views INTEGER DEFAULT 0,
            replies INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            tags TEXT,
            sphere_id INTEGER NOT NULL,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (sphere_id) REFERENCES spheres(id) ON DELETE CASCADE
        );
    """)

    # Replies table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            author_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)

    # Spheres table (subforums)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS spheres (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            creator_id INTEGER NOT NULL,
            tags TEXT,
            FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)

    # Sphere members table to track memberships and roles
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sphere_members (
            sphere_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            joined_at TEXT NOT NULL,
            PRIMARY KEY (sphere_id, user_id),
            FOREIGN KEY (sphere_id) REFERENCES spheres(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)

    conn.commit()
    conn.close()
    print("Tables created or verified successfully.")

def hash_password(password):
    """
    Hashes a password using bcrypt.
    
    Args:
        password (str): The plain text password.
    
    Returns:
        str: The hashed password.
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def add_dummy_users(n=10):
    """
    Inserts 'n' dummy user records into the 'users' table.
    
    Args:
        n (int): Number of dummy users to add.
    """
    conn = get_connection()
    cursor = conn.cursor()

    users = []
    for _ in range(n):
        username = fake.unique.user_name()
        email = fake.unique.email()
        password = hash_password(fake.password(length=12))  
        bio = fake.text(max_nb_chars=200)
        location = fake.city() + ", " + fake.state()
        birthday = fake.date_of_birth(minimum_age=18, maximum_age=80).strftime("%m/%d/%Y")
        created_at = fake.date_time_between(start_date='-2y', end_date='now').isoformat() + 'Z'
        email_public = random.choice([0, 1])
        location_public = random.choice([0, 1])
        birthday_public = random.choice([0, 1])
        spheres_public = random.choice([0, 1])
        posts_public = random.choice([0, 1])
        profile_picture = f"/uploads/avatar_{random.randint(1, 10)}.jpg"  # Random placeholder avatars
        
        users.append((
            username, email, password, bio, location, birthday, created_at, 
            email_public, location_public, birthday_public, spheres_public, posts_public, profile_picture
        ))
    
    try:
        cursor.executemany("""
            INSERT INTO users (
                username, email, password, bio, location, birthday, created_at,
                email_public, location_public, birthday_public, spheres_public, posts_public, profile_picture
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, users)
        conn.commit()
        print(f"Inserted {cursor.rowcount} dummy users into 'users' table.")
    except sqlite3.IntegrityError as e:
        print(f"Error inserting users: {e}")
    finally:
        conn.close()

def add_dummy_spheres(n=5):
    """
    Inserts 'n' dummy sphere records into the 'spheres' table.
    
    Args:
        n (int): Number of dummy spheres to add.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Fetch all user IDs to assign as creators
    cursor.execute("SELECT id FROM users;")
    users = cursor.fetchall()
    if not users:
        print("No users found. Please add users before adding spheres.")
        conn.close()
        return
    user_ids = [user[0] for user in users]

    sphere_names = [
        "Technology Enthusiasts", "Book Lovers", "Travel Adventures",
        "Gaming Community", "Fitness Goals", "Food & Recipes",
        "Movies & TV Shows", "Music Discussion", "Pet Owners",
        "DIY Projects"
    ]
    
    random.shuffle(sphere_names)
    spheres_to_create = min(n, len(sphere_names))
    
    spheres = []
    for i in range(spheres_to_create):
        name = sphere_names[i]
        description = fake.paragraph()
        creator_id = random.choice(user_ids)
        created_at = fake.date_time_between(start_date='-1y', end_date='now').isoformat() + 'Z'
        tags = ','.join(fake.words(nb=random.randint(2, 5)))
        
        spheres.append((name, description, created_at, creator_id, tags))
    
    try:
        cursor.executemany("""
            INSERT INTO spheres (name, description, created_at, creator_id, tags)
            VALUES (?, ?, ?, ?, ?);
        """, spheres)
        conn.commit()
        sphere_ids = [cursor.lastrowid - i for i in range(spheres_to_create)]
        
        # Add creators as admins
        sphere_members = []
        for i, sphere in enumerate(spheres):
            sphere_id = sphere_ids[i]
            creator_id = sphere[3]
            joined_at = sphere[2]  # Same as created_at
            sphere_members.append((sphere_id, creator_id, 'admin', joined_at))
            
            # Add some random members
            for _ in range(random.randint(3, 10)):
                member_id = random.choice(user_ids)
                if member_id != creator_id:  # Don't duplicate the creator
                    member_joined = fake.date_time_between(start_date=joined_at, end_date='now').isoformat() + 'Z'
                    sphere_members.append((sphere_id, member_id, 'member', member_joined))
        
        cursor.executemany("""
            INSERT INTO sphere_members (sphere_id, user_id, role, joined_at)
            VALUES (?, ?, ?, ?);
        """, sphere_members)
        conn.commit()
        
        print(f"Inserted {spheres_to_create} dummy spheres into 'spheres' table.")
        print(f"Added {len(sphere_members)} sphere memberships.")
    except sqlite3.IntegrityError as e:
        print(f"Error inserting spheres: {e}")
    finally:
        conn.close()
    
    return sphere_ids

def add_dummy_posts(n=20):
    """
    Inserts 'n' dummy post records into the 'posts' table.
    
    Args:
        n (int): Number of dummy posts to add.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Fetch all sphere IDs
    cursor.execute("SELECT id FROM spheres;")
    spheres = cursor.fetchall()
    if not spheres:
        print("No spheres found. Please add spheres before adding posts.")
        conn.close()
        return
    sphere_ids = [sphere[0] for sphere in spheres]
    
    # For each sphere, get members who can post
    posts = []
    for sphere_id in sphere_ids:
        cursor.execute("SELECT user_id FROM sphere_members WHERE sphere_id = ?;", (sphere_id,))
        members = cursor.fetchall()
        if not members:
            continue
            
        member_ids = [member[0] for member in members]
        
        # Generate posts for this sphere
        posts_per_sphere = n // len(sphere_ids) + (1 if sphere_id % len(sphere_ids) < n % len(sphere_ids) else 0)
        
        for _ in range(posts_per_sphere):
            subject = fake.sentence(nb_words=6)
            content = fake.paragraph(nb_sentences=5)
            author_id = random.choice(member_ids)
            replies = random.randint(0, 20)
            views = random.randint(replies, 100)
            likes = random.randint(0, 50)
            created_at = fake.date_time_between(start_date='-1y', end_date='now').isoformat() + 'Z'
            tags = ','.join(fake.words(nb=random.randint(1, 4)))
            
            posts.append((subject, content, author_id, created_at, views, replies, likes, tags, sphere_id))
    
    try:
        cursor.executemany("""
            INSERT INTO posts (subject, content, author_id, created_at, views, replies, likes, tags, sphere_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, posts)
        conn.commit()
        print(f"Inserted {cursor.rowcount} dummy posts into 'posts' table.")
        
        # Get post IDs for adding replies
        cursor.execute("SELECT id, author_id FROM posts ORDER BY id DESC LIMIT ?;", (len(posts),))
        post_data = cursor.fetchall()
        
        add_dummy_replies(post_data)
        
    except sqlite3.IntegrityError as e:
        print(f"Error inserting posts: {e}")
    finally:
        conn.close()

def add_dummy_replies(post_data):
    """
    Inserts dummy reply records for given posts.
    
    Args:
        post_data (list): List of (post_id, author_id) tuples.
    """
    if not post_data:
        return
        
    conn = get_connection()
    cursor = conn.cursor()
    
    # Fetch all user IDs for reply authors
    cursor.execute("SELECT id FROM users;")
    users = cursor.fetchall()
    if not users:
        print("No users found. Cannot add replies.")
        conn.close()
        return
    user_ids = [user[0] for user in users]
    
    replies = []
    for post_id, original_author in post_data:
        # Each post gets 0-10 replies
        for _ in range(random.randint(0, 10)):
            # Pick a user that's not the original author for variety
            potential_authors = [uid for uid in user_ids if uid != original_author]
            author_id = random.choice(potential_authors) if potential_authors else random.choice(user_ids)
            
            content = fake.paragraph()
            created_at = fake.date_time_between(start_date='-1y', end_date='now').isoformat() + 'Z'
            
            replies.append((post_id, author_id, content, created_at))
    
    try:
        cursor.executemany("""
            INSERT INTO replies (post_id, author_id, content, created_at)
            VALUES (?, ?, ?, ?);
        """, replies)
        conn.commit()
        print(f"Inserted {cursor.rowcount} dummy replies.")
    except sqlite3.IntegrityError as e:
        print(f"Error inserting replies: {e}")
    finally:
        conn.close()

def check_table_schema():
    """
    Checks if the database tables have the expected schema.
    Returns a dictionary of tables that need updating.
    """
    conn = get_connection()
    cursor = conn.cursor()
    tables_to_update = {}
    
    # Check posts table for sphere_id column
    cursor.execute("PRAGMA table_info(posts);")
    columns = {column[1].lower(): column for column in cursor.fetchall()}
    if 'sphere_id' not in columns:
        tables_to_update['posts'] = True
    
    # Check users table for profile_picture column and posts_public column
    cursor.execute("PRAGMA table_info(users);")
    user_columns = {column[1].lower(): column for column in cursor.fetchall()}
    if 'profile_picture' not in user_columns or 'posts_public' not in user_columns:
        tables_to_update['users'] = True
    
    # Check for other required columns in the future
    
    conn.close()
    return tables_to_update

def upgrade_schema(tables_to_update):
    """
    Upgrades the database schema for tables that need it.
    
    Args:
        tables_to_update (dict): Dictionary of tables that need updating.
    """
    if not tables_to_update:
        print("Database schema is up to date.")
        return
    
    conn = get_connection()
    cursor = conn.cursor()
    
    if 'posts' in tables_to_update:
        print("Updating posts table schema...")
        
        # Create a new posts table with the correct schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS posts_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject TEXT NOT NULL,
                content TEXT NOT NULL,
                author_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                views INTEGER DEFAULT 0,
                replies INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                tags TEXT,
                sphere_id INTEGER NOT NULL,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (sphere_id) REFERENCES spheres(id) ON DELETE CASCADE
            );
        """)
        
        # Copy data from old table to new table with default sphere_id=1
        try:
            cursor.execute("SELECT * FROM posts;")
            rows = cursor.fetchall()
            
            # Ensure at least one sphere exists
            cursor.execute("SELECT COUNT(*) FROM spheres;")
            sphere_count = cursor.fetchone()[0]
            if sphere_count == 0:
                # Create a default sphere if none exists
                cursor.execute("""
                    INSERT INTO spheres (name, description, created_at, creator_id, tags)
                    SELECT 'General', 'Default sphere', datetime('now'), 
                           (SELECT id FROM users ORDER BY id LIMIT 1), 'general'
                    WHERE EXISTS (SELECT 1 FROM users LIMIT 1);
                """)
                conn.commit()
            
            # Get the first sphere ID
            cursor.execute("SELECT id FROM spheres ORDER BY id LIMIT 1;")
            default_sphere_id = cursor.fetchone()
            default_sphere_id = default_sphere_id[0] if default_sphere_id else 1
            
            # Insert old posts with the default sphere_id
            for row in rows:
                cursor.execute("""
                    INSERT INTO posts_new (id, subject, content, author_id, created_at, 
                                          views, replies, likes, tags, sphere_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (row[0], row[1], row[2], row[3], row[4], 
                      row[5], row[6], row[7] if len(row) > 7 else 0, 
                      row[8] if len(row) > 8 else '', default_sphere_id))
        except sqlite3.Error as e:
            print(f"Error copying posts data: {e}")
        
        # Drop the old table and rename the new one
        cursor.execute("DROP TABLE IF EXISTS posts;")
        cursor.execute("ALTER TABLE posts_new RENAME TO posts;")
        print("Posts table updated successfully.")
    
    if 'users' in tables_to_update:
        print("Updating users table schema...")
        
        # Check which columns need to be added
        cursor.execute("PRAGMA table_info(users);")
        user_columns = {column[1].lower(): column for column in cursor.fetchall()}
        
        try:
            # Add profile_picture column if it doesn't exist
            if 'profile_picture' not in user_columns:
                cursor.execute("ALTER TABLE users ADD COLUMN profile_picture TEXT;")
                print("Added profile_picture column to users table")
            
            # Add posts_public column if it doesn't exist
            if 'posts_public' not in user_columns:
                cursor.execute("ALTER TABLE users ADD COLUMN posts_public BOOLEAN DEFAULT 1;")
                print("Added posts_public column to users table")
                
            print("Users table updated successfully")
        except sqlite3.Error as e:
            print(f"Error updating users table: {e}")
    
    conn.commit()
    conn.close()

def init_database():
    """
    Initialize the database, creating tables if they don't exist
    and upgrading the schema if needed.
    """
    # Create tables if they don't exist
    create_tables()
    
    # Check and upgrade schema if needed
    tables_to_update = check_table_schema()
    if tables_to_update:
        upgrade_schema(tables_to_update)

def main():
    """
    Provides a Command-Line Interface (CLI) for interacting with the script.
    """
    while True:
        print("\n=== GatherSphere Database Population ===")
        print("1. Create/Reset Tables")
        print("2. Add Dummy Users")
        print("3. Add Dummy Spheres")
        print("4. Add Dummy Posts & Replies")
        print("5. Populate All (Users, Spheres, Posts, Replies)")
        print("6. Exit")

        choice = input("Enter your choice (1-6): ")

        if choice == '1':
            create_tables()
        elif choice == '2':
            try:
                n = int(input("How many dummy users would you like to add? "))
                add_dummy_users(n)
            except ValueError:
                print("Please enter a valid integer.")
        elif choice == '3':
            try:
                n = int(input("How many dummy spheres would you like to add? "))
                add_dummy_spheres(n)
            except ValueError:
                print("Please enter a valid integer.")
        elif choice == '4':
            try:
                n = int(input("How many dummy posts would you like to add? "))
                add_dummy_posts(n)
            except ValueError:
                print("Please enter a valid integer.")
        elif choice == '5':
            try:
                user_count = int(input("How many dummy users? "))
                add_dummy_users(user_count)
                
                sphere_count = int(input("How many dummy spheres? "))
                add_dummy_spheres(sphere_count)
                
                post_count = int(input("How many dummy posts? "))
                add_dummy_posts(post_count)
                
                print("Database populated successfully!")
            except ValueError:
                print("Please enter a valid integer.")
        elif choice == '6':
            print("Exiting the database population script. Goodbye!")
            break
        else:
            print("Invalid choice. Please select an option between 1 and 6.")

if __name__ == "__main__":
    # Check if database file exists; if not, create tables
    if not os.path.isfile(DB_FILE):
        print(f"Database file '{DB_FILE}' not found. Creating tables...")
        create_tables()
    else:
        # If database exists, check and upgrade schema if needed
        tables_to_update = check_table_schema()
        if tables_to_update:
            print(f"Database schema needs updating. Upgrading...")
            upgrade_schema(tables_to_update)
    
    main()
