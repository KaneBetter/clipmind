#!/bin/bash
set -e

echo "=== ClipMind Backend Starting ==="

# Ensure data directories exist
mkdir -p /app/data/thumbnails/converted

# Initialize database tables
echo "Initializing database..."
python -c "
from clipmind.database import engine, Base
from clipmind.models import *
Base.metadata.create_all(bind=engine)
print('Database initialized successfully')

# Lightweight schema migrations for new columns
from sqlalchemy import text, inspect
insp = inspect(engine)

def add_column_if_missing(table, column, col_type):
    cols = [c['name'] for c in insp.get_columns(table)]
    if column not in cols:
        with engine.begin() as conn:
            conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
        print(f'  Added {table}.{column}')

add_column_if_missing('projects', 'photo_dir', 'VARCHAR(500)')
add_column_if_missing('projects', 'music_dir', 'VARCHAR(500)')
add_column_if_missing('videos', 'user_comment', 'TEXT')
add_column_if_missing('videos', 'is_hidden', 'BOOLEAN DEFAULT FALSE')
add_column_if_missing('copywrites', 'custom_prompt', 'TEXT')
add_column_if_missing('music', 'project_id', 'INTEGER REFERENCES projects(id)')
add_column_if_missing('music', 'onsets', 'JSON')
add_column_if_missing('music', 'sections', 'JSON')
add_column_if_missing('analyses', 'prompt_token_count', 'INTEGER')
add_column_if_missing('analyses', 'candidate_token_count', 'INTEGER')
add_column_if_missing('analyses', 'thoughts_token_count', 'INTEGER')
add_column_if_missing('analyses', 'prompt_tokens_details', 'JSON')
print('Schema migrations complete')
"

# Start uvicorn
echo "Starting uvicorn on port 8000..."
exec uvicorn clipmind.main:app --host 0.0.0.0 --port 8000
