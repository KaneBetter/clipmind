# Database Schema

SQLite database at `data/clipmind.db`. Auto-created on startup via SQLAlchemy `create_all()`.

## Tables

### projects

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| name | VARCHAR(200) | Project display name |
| video_dir | VARCHAR(500) | Source directory path |
| description | VARCHAR(2000) | nullable |
| created_at | DATETIME | |

### videos

Both videos and photos (distinguished by `media_type`).

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| project_id | FK→projects | |
| filename | VARCHAR(300) | indexed |
| path | VARCHAR(500) | Full filesystem path |
| media_type | VARCHAR(10) | "video" or "photo" |
| duration | FLOAT | 0.0 for photos |
| width, height | INTEGER | nullable |
| lat, lon, altitude | FLOAT | GPS, nullable |
| location_label | VARCHAR(200) | Clustered location name |
| thumbnail_path | VARCHAR(500) | Relative to thumbnails dir |
| user_comment | TEXT | Free text note for AI context |

### analyses

1:1 with videos. AI analysis results from Gemini.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| video_id | FK→videos UNIQUE | |
| scene_category | VARCHAR(50) | landscape, people, food, etc. |
| quality_score | FLOAT | 1.0 - 10.0 |
| is_highlight | BOOLEAN | |
| mood | VARCHAR(50) | epic, calm, joyful, etc. |
| description | TEXT | AI-generated |
| segments | JSON | Timeline segments |

### stabilities

1:1 with videos. OpenCV shake detection results.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| video_id | FK→videos UNIQUE | |
| overall_score | FLOAT | 0-100 |
| is_stable | BOOLEAN | |
| stable_ratio | FLOAT | 0-1 |
| stable_segments | JSON | [{start, end, avg_shake}] |
| shaky_segments | JSON | [{start, end, avg_shake}] |
| shake_curve | JSON | ~200 downsampled points |
| threshold | FLOAT | Default 5.0 |

### clips

Usable video segments extracted from analysis + stability.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| project_id | FK→projects | |
| video_id | FK→videos | |
| start_time | FLOAT | Seconds |
| end_time | FLOAT | Seconds |
| duration | FLOAT | Computed |
| stability_score | FLOAT | From stability analysis |
| quality_score | FLOAT | From AI analysis |
| scene_type | VARCHAR(50) | |
| mood | VARCHAR(50) | |
| description | TEXT | |
| location_cluster | VARCHAR(200) | |
| gps_lat, gps_lon | FLOAT | |
| usable | BOOLEAN | Default true |

### timelines

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| project_id | FK→projects | |
| name | VARCHAR(200) | e.g. location name |
| location_cluster | VARCHAR(200) | nullable (null = global) |
| status | VARCHAR(50) | draft / finalized |
| total_duration | FLOAT | |
| created_at, updated_at | DATETIME | |

### timeline_clips

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| timeline_id | FK→timelines | |
| clip_id | FK→clips | nullable |
| video_id | FK→videos | |
| position | INTEGER | Sort order |
| source_start | FLOAT | Start in source video |
| source_end | FLOAT | End in source video |
| transition | VARCHAR(50) | cut / crossfade / fade_black |

### timeline_subtitles

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| timeline_id | FK→timelines | |
| text | TEXT | |
| start_time | FLOAT | |
| end_time | FLOAT | |
| style | VARCHAR(50) | default / cinematic / minimal |

### timeline_music

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| timeline_id | FK→timelines | |
| music_id | FK→music | |
| start_time | FLOAT | |
| end_time | FLOAT | |
| volume | FLOAT | Default 0.7 |
| fade_in, fade_out | FLOAT | |

### music

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | |
| project_id | FK→projects | nullable |
| title | VARCHAR(300) | |
| path | VARCHAR(500) | |
| duration | FLOAT | |
| bpm | FLOAT | From librosa |
| beats | JSON | Beat timestamps |
| onsets | JSON | Onset timestamps |
| sections | JSON | Section boundaries |

### copywrites, exports

See models for full schema.

## Relationships

```
Project 1──N Video 1──0..1 Analysis
                    1──0..1 Stability
Project 1──N Clip
Project 1──N Timeline 1──N TimelineClip
                      1──N TimelineSubtitle
                      1──N TimelineMusic
Project 1──N Music
Project 1──N Copywrite
Project 1──N Export
```
