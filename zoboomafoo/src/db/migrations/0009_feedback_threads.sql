CREATE TABLE feedback_threads (
  thread_id TEXT PRIMARY KEY,
  image_url TEXT,
  original_prompt TEXT,
  created_at INTEGER NOT NULL
);