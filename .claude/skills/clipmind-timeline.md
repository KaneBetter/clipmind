---
name: clipmind-timeline
description: Create and modify video timelines for ClipMind projects. Read clips/analysis/stability/music data, then create or edit timelines by writing to the DB via API.
---

# ClipMind Timeline — Create & Edit

You are operating as a video editor. Your job is to read project data and create/modify timelines by calling the ClipMind API (localhost:8000).

## Step 1: Understand the Project

```bash
# Get available clips (extracted from AI analysis + stability)
curl -s http://localhost:8000/api/clips/{PROJECT_ID} | python3 -m json.tool

# Get clips summary by location
curl -s http://localhost:8000/api/clips/{PROJECT_ID}/summary | python3 -m json.tool

# Get AI analysis results for context
curl -s http://localhost:8000/api/analysis/results/{PROJECT_ID} | python3 -m json.tool

# Get stability usable segments
curl -s http://localhost:8000/api/stability/usable-segments/{PROJECT_ID} | python3 -m json.tool

# Get music library with beat data
curl -s http://localhost:8000/api/music/project/{PROJECT_ID} | python3 -m json.tool
```

If clips haven't been extracted yet, run extraction first:
```bash
curl -X POST http://localhost:8000/api/clips/extract/{PROJECT_ID}
```

## Step 2: List Existing Timelines

```bash
curl -s http://localhost:8000/api/timelines/{PROJECT_ID} | python3 -m json.tool
```

## Step 3: Create a Timeline

Create one timeline per location (or a global one). Include clips, subtitles, and music.

```bash
curl -X POST http://localhost:8000/api/timelines/{PROJECT_ID} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "地点名称",
    "location_cluster": "location_label_or_null",
    "clips": [
      {
        "clip_id": 1,
        "video_id": 10,
        "position": 0,
        "source_start": 2.5,
        "source_end": 7.0,
        "transition": "cut"
      },
      {
        "clip_id": 2,
        "video_id": 12,
        "position": 1,
        "source_start": 0.0,
        "source_end": 4.5,
        "transition": "crossfade"
      }
    ],
    "subtitles": [
      {"text": "字幕内容", "start_time": 0, "end_time": 3.0, "style": "default"},
      {"text": "更多字幕", "start_time": 4.5, "end_time": 7.0, "style": "cinematic"}
    ],
    "music": [
      {
        "music_id": 5,
        "start_time": 0,
        "end_time": 30,
        "volume": 0.7,
        "fade_in": 1.0,
        "fade_out": 2.0
      }
    ]
  }'
```

## Step 4: Modify a Timeline

### Bulk update (replace all clips/subtitles/music):
```bash
curl -X PUT http://localhost:8000/api/timelines/{TIMELINE_ID} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新名字",
    "clips": [...],
    "subtitles": [...],
    "music": [...]
  }'
```

### Replace just subtitles:
```bash
curl -X PUT http://localhost:8000/api/timelines/{TIMELINE_ID}/subtitles \
  -H "Content-Type: application/json" \
  -d '[
    {"text": "新字幕", "start_time": 0, "end_time": 3.0, "style": "default"}
  ]'
```

### Replace just music:
```bash
curl -X PUT http://localhost:8000/api/timelines/{TIMELINE_ID}/music \
  -H "Content-Type: application/json" \
  -d '[
    {"music_id": 3, "start_time": 0, "end_time": 25, "volume": 0.6}
  ]'
```

### Add a single clip:
```bash
curl -X POST http://localhost:8000/api/timelines/{TIMELINE_ID}/clips \
  -H "Content-Type: application/json" \
  -d '{"clip_id": 5, "video_id": 20, "position": 3, "source_start": 1.0, "source_end": 5.0}'
```

### Delete a clip:
```bash
curl -X DELETE http://localhost:8000/api/timelines/{TIMELINE_ID}/clips/{CLIP_RECORD_ID}
```

### Delete entire timeline:
```bash
curl -X DELETE http://localhost:8000/api/timelines/{TIMELINE_ID}
```

## Editing Principles

### Clip Selection
- **Prioritize**: highlight clips > high quality > stable footage
- **Skip**: shaky clips (high stability_score means more shake)
- **Variety**: mix different scene types within a location

### Rhythm & Pacing
- Match clip durations to music BPM when available
- Fast BPM (>120) → shorter clips (2-4s)
- Slow BPM (<90) → longer clips (5-10s)
- Use beat timestamps from music analysis for cut points

### Transitions
- `cut` — same scene/location continuity
- `crossfade` — scene or mood change
- `fade_black` — end of a location segment

### Subtitles (影视飓风 Style)
- Short Chinese text, max 15 characters per subtitle
- Use `[keyword]` brackets for yellow highlight keywords
- Style options: `bold` (opening/closing), `normal` (2.5s), `bomb` (1.5s, dramatic)
- Opening: location name at start of timeline
- Closing: farewell line at end of timeline
- Chapter transitions: when scene_category changes between clips
- Rhythm burst: extra "bomb" text for 3+ consecutive highlight clips
- Density: ~1 subtitle per 2-3 clips, aim for 30-40 per timeline
- Use `scripts/gen_subs_v2.py` for batch generation (rule-based, no AI API)

### Music
- Match mood: energetic clips → upbeat music, calm scenes → ambient
- Use music sections for timeline structure (intro → body → outro)
- Set fade_in for the first music block, fade_out for the last

### Clip Constraints
- Min duration: 1.5s, max duration: 5s
- Trim first/last 1s from each video (camera jitter)
- Skip vertical videos (height > width)
- Skip videos > 190MB (CapCut Mate file size limit)
- Snap to music beat grid when beat data is available

## Batch Generation

For generating all timelines at once, use `scripts/generate_timelines_v2.py`:
```bash
python3 scripts/generate_timelines_v2.py
```

For regenerating subtitles only:
```bash
python3 scripts/gen_subs_v2.py
```

## Export to JianYing

After creating timelines, use `/clipmind-export` to export to JianYing (剪映).
- Single timeline: `POST /api/export/{PROJECT_ID}` with `{"timeline_id": N}`
- All timelines (multi-timeline tabs): `POST /api/export/{PROJECT_ID}/all`
- See `/clipmind-export` skill for post-processing steps (path rewriting, track merging)

## Workflow

1. Read clips summary to understand locations and available footage
2. Read music library to find suitable tracks
3. For each location, create a timeline with selected clips + subtitles + music
4. Tell the user to check the Timeline page in the browser for visual preview
5. Iterate based on user feedback (modify clips, change music, update subtitles)
6. When ready, export to JianYing via `/clipmind-export`
