import sqlite3
from faker import Faker
import random
from datetime import datetime
import os

fake = Faker()
# REPLACE THIS WITH YOU DB FILE
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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL,
            content TEXT NOT NULL,
            author_id INTEGER NOT NULL,
            replies INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)

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

    conn.commit()
    conn.close()
    print("Tables created or verified successfully.")

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
        password = fake.password(length=12)  # In production, always hash passwords!
        created_at = fake.date_time_between(start_date='-2y', end_date='now').strftime('%Y-%m-%d %H:%M:%S')
        users.append((username, email, password, created_at))
    
    try:
        cursor.executemany("""
            INSERT INTO users (username, email, password, created_at)
            VALUES (?, ?, ?, ?);
        """, users)
        conn.commit()
        print(f"Inserted {cursor.rowcount} dummy users into 'users' table.")
    except sqlite3.IntegrityError as e:
        print(f"Error inserting users: {e}")
    finally:
        conn.close()

def add_dummy_posts(n=20):
    """
    Inserts 'n' dummy post records into the 'posts' table.
    
    Args:
        n (int): Number of dummy posts to add.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Fetch all user IDs to assign as authors
    cursor.execute("SELECT id FROM users;")
    users = cursor.fetchall()
    if not users:
        print("No users found. Please add users before adding posts.")
        conn.close()
        return
    user_ids = [user[0] for user in users]

    posts = []
    for _ in range(n):
        subject = fake.sentence(nb_words=6)
        content = fake.paragraph(nb_sentences=5)
        author_id = random.choice(user_ids)
        replies = random.randint(0, 100)
        views = random.randint(0, 1000)
        created_at = fake.date_time_between(start_date='-2y', end_date='now').strftime('%Y-%m-%d %H:%M:%S')
        posts.append((subject, content, author_id, replies, views, created_at))
    
    try:
        cursor.executemany("""
            INSERT INTO posts (subject, content, author_id, replies, views, created_at)
            VALUES (?, ?, ?, ?, ?, ?);
        """, posts)
        conn.commit()
        print(f"Inserted {cursor.rowcount} dummy posts into 'posts' table.")
    except sqlite3.IntegrityError as e:
        print(f"Error inserting posts: {e}")
    finally:
        conn.close()

def main():
    """
    Provides a Command-Line Interface (CLI) for interacting with the script.
    """
    while True:
        print("\n=== GatherSphere Database Population ===")
        print("1. Create Tables")
        print("2. Add Dummy Users")
        print("3. Add Dummy Posts")
        print("4. Exit")

        choice = input("Enter your choice (1-9): ")

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
                n = int(input("How many dummy posts would you like to add? "))
                add_dummy_posts(n)
            except ValueError:
                print("Please enter a valid integer.")
        elif choice == '4':
            print("Exiting the database population script. Goodbye!")
            break
        else:
            print("Invalid choice. Please select an option between 1 and 9.")

if __name__ == "__main__":
    # Check if database file exists; if not, create tables
    if not os.path.isfile(DB_FILE):
        print(f"Database file '{DB_FILE}' not found. Creating tables...")
        create_tables()
    main()
