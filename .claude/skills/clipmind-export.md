---
name: clipmind-export
description: Export ClipMind timelines to JianYing (剪映) via CapCut Mate API. Supports single-timeline and multi-timeline (one draft, multiple JianYing timeline tabs) export.
---

# ClipMind Export — Timeline to 剪映

Export timelines to a JianYing/CapCut draft project via CapCut Mate API.

## Prerequisites

- CapCut Mate must be running at `http://localhost:30000`
- File server must be running at `http://localhost:18080` (serves video/music files)
- Timeline must exist in the DB (use `/clipmind-timeline` to create one first)
- Music files must be real files (not symlinks) — JianYing cannot follow symlinks

## Step 1: Check Available Timelines

```bash
curl -s http://localhost:8000/api/timelines/{PROJECT_ID} | python3 -m json.tool
```

Review: name, clip_count, subtitle_count, music_count, status, total_duration.

## Step 2: Export

### Single Timeline

```bash
curl -X POST http://localhost:8000/api/export/{PROJECT_ID} \
  -H "Content-Type: application/json" \
  -d '{"timeline_id": {TIMELINE_ID}, "draft_name": "名称 (可选)"}'
```

### All Timelines (one draft, multiple JianYing timeline tabs)

```bash
curl --max-time 3600 -X POST http://localhost:8000/api/export/{PROJECT_ID}/all \
  -H "Content-Type: application/json" \
  -d '{"draft_name": "名称 (可选)"}'
```

**Note**: Multi-timeline export takes 10-20 minutes (CapCut Mate downloads all videos). Use `--max-time 3600`.

## Step 3: Post-Process (REQUIRED)

CapCut Mate runs in Docker and stores Docker paths (`/app/output/...`) in the draft. You must:

### 3a. Rewrite paths to original local files

```python
# Match downloaded files to originals by file size
for video_material in draft["materials"]["videos"]:
    docker_path = video_material["path"]
    local_path = docker_path.replace("/app/output/", "~/code/capcut-mate/output/")
    original = match_by_filesize(local_path, VIDEO_DIR)
    video_material["path"] = original
```

### 3b. Resolve symlinks for music

JianYing cannot follow symlinks. Use `os.path.realpath()` on all audio paths.

### 3c. Merge video tracks

CapCut Mate creates a new track per `add_videos` batch call. Merge all video track segments into one track:

```python
video_tracks = [t for t in tracks if t["type"] == "video" and t["segments"]]
main = video_tracks[0]
for extra in video_tracks[1:]:
    main["segments"].extend(extra["segments"])
data["tracks"] = [main] + non_video_tracks
```

### 3d. Delete downloaded copies

After rewriting paths, delete `assets/videos/` and `assets/audios/` to reclaim disk space (~50GB).

## Step 4: Register in JianYing (Multi-Timeline)

For multi-timeline export, assemble the JianYing draft structure:

```
{DRAFT_UUID}/
  draft_content.json    # First timeline content (root)
  draft_info.json       # Same as draft_content.json
  draft_meta_info.json  # Draft name, UUID, paths
  template.tmp
  assets/
  Timelines/
    project.json        # Lists all timeline UUIDs and names
    {TL_UUID_1}/
      draft_info.json   # Timeline 1 content
    {TL_UUID_2}/
      draft_info.json   # Timeline 2 content
    ...
  timeline_layout.json  # Tab layout with timelineIds and timelineNames
```

Key files:

**project.json**:
```json
{
  "main_timeline_id": "{TL_UUID_1}",
  "timelines": [
    {"id": "{TL_UUID_1}", "name": "Bay Area", "create_time": ...},
    {"id": "{TL_UUID_2}", "name": "Las Vegas", "create_time": ...}
  ]
}
```

**timeline_layout.json**:
```json
{
  "dockItems": [{
    "dockIndex": 0, "ratio": 1,
    "timelineIds": ["{TL_UUID_1}", "{TL_UUID_2}"],
    "timelineNames": ["Bay Area", "Las Vegas"]
  }]
}
```

**draft_meta_info.json** must have:
- `draft_name`: display name
- `draft_id`: UUID
- `draft_fold_path`: full macOS path to the draft directory
- `draft_root_path`: JianYing drafts root

**Register** in `root_meta_info.json`:
```json
{"all_draft_store": [{"draft_fold_path": "...", "draft_id": "...", "draft_name": "..."}]}
```

Copy the assembled draft to:
```
~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/{DRAFT_UUID}/
```

## Important Notes

- **No symlinks**: JianYing does not follow symlinks for media files or draft directories
- **Encryption**: JianYing encrypts `draft_info.json` after first open — subsequent edits must recreate the draft from scratch
- **File size limit**: CapCut Mate rejects files > 200MB. Code skips these automatically
- **Batch size**: Videos are added in batches of 30 to avoid download errors
- Each export creates a new draft — previous exports are not overwritten

## Troubleshooting

- **CapCut Mate not running**: `docker compose -f ~/code/capcut-mate/docker-compose.yml up -d`
- **Videos not found in JianYing**: Check paths are real macOS paths (not Docker `/app/` paths)
- **Music not found**: Ensure music paths are real files, not symlinks (`os.path.realpath()`)
- **Multiple video tracks**: Merge video tracks in draft_content.json before registering
- **Draft corrupted**: Delete from JianYing drafts dir, recreate from scratch
- **Export timeout**: Use `--max-time 3600` with curl for large exports
