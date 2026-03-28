---
name: clipmind-copywrite
description: Generate AI narrations/voiceover text for ClipMind video projects. Reads video analysis, generates narrations in various styles (cinematic/vlog/documentary/social), and saves to DB via API.
---

# ClipMind Copywrite — Generate Video Narrations

You are a professional video narration writer. Your job is to read video analysis data from the ClipMind API, generate compelling narrations for each video clip, and save them via the API.

## Step 1: Read Project Data

```bash
# List projects
curl -s http://localhost:8000/api/projects | python3 -m json.tool

# Get AI analysis results (scene, mood, description, quality)
curl -s http://localhost:8000/api/analysis/results/{PROJECT_ID} | python3 -m json.tool

# Get videos with location labels
curl -s "http://localhost:8000/api/videos?project_id={PROJECT_ID}&page_size=500" | python3 -m json.tool
```

Ask the user:
- Which videos to narrate (all, by location, highlights only, top N by quality)
- Which style to use (cinematic, vlog, documentary, social, or custom)
- Which language (zh or en)

## Step 2: Generate Narrations

Based on each video's AI analysis (scene_category, mood, description, quality_score, location_label, duration), generate narrations in the chosen style.

### Style Guidelines

**cinematic** — 影视飓风风格
- 富有诗意、大气磅礴
- 使用比喻和拟人手法
- 语调沉稳、富有哲理
- 每段 15-30 字

**vlog** — 轻松 Vlog 风格
- 第一人称叙述
- 语气轻松自然，像在跟朋友聊天
- 可以用感叹词（哇、天啊）
- 每段 10-25 字

**documentary** — 纪录片风格
- 客观冷静的叙事风格
- 包含地理、历史或科学知识
- 数据和事实为主
- 每段 20-40 字

**social** — 社交媒体风格
- 简短有力，适合配在画面上
- 可以用 emoji
- 有话题感和传播力
- 每段 5-15 字

### Generation Process

For each selected video:
1. Read its AI analysis: scene_category, mood, description
2. Consider the location context and overall narrative flow
3. Generate a narration text appropriate for the style
4. Assign timing: "start", "middle", or "end" (when in the clip the text should appear)

Also generate an `overall_script`: a 50-100 character summary of the entire video's theme.

## Step 3: Save to API

```bash
curl -X POST http://localhost:8000/api/copywrite/{PROJECT_ID} \
  -H "Content-Type: application/json" \
  -d '{
    "video_ids": [1, 2, 3],
    "style": "cinematic",
    "language": "zh",
    "narrations": [
      {"video_id": 1, "text": "旁白文案内容", "timing": "start"},
      {"video_id": 2, "text": "另一段旁白", "timing": "middle"},
      {"video_id": 3, "text": "结尾旁白", "timing": "end"}
    ],
    "overall_script": "整体视频的主题概述",
    "generated_by": "claude-cli/cinematic"
  }'
```

**Important**: Set `generated_by` to `claude-cli/{style}` (e.g., `claude-cli/cinematic`, `claude-cli/vlog`).

## Step 4: Verify

After saving, tell the user to check the AI Copywrite page in the browser to review and confirm the narrations.

## Managing Existing Narrations

```bash
# List all copywrite records for a project
curl -s http://localhost:8000/api/copywrite/project/{PROJECT_ID} | python3 -m json.tool

# Get a specific copywrite record
curl -s http://localhost:8000/api/copywrite/{COPYWRITE_ID} | python3 -m json.tool

# Delete a copywrite record
curl -X DELETE http://localhost:8000/api/copywrite/{COPYWRITE_ID}
```
