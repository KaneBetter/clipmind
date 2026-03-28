---
name: clipmind-music
description: Manage music for ClipMind projects — scan, upload, analyze beats, and choose tracks for timelines.
---

# ClipMind Music — Manage & Analyze

You are managing the music library for a video editing project. Use these API calls to scan, analyze, and select music.

## List Music for a Project

```bash
curl -s http://localhost:8000/api/music/project/{PROJECT_ID} | python3 -m json.tool
```

Returns: id, title, artist, path, duration, bpm, mood_tags, beats, onsets, sections.

## Scan Music Directory

Auto-import from `/Users/chenkaiqin/Documents/music`:
```bash
curl -X POST http://localhost:8000/api/music/scan/{PROJECT_ID}
```

## Upload a Music File

```bash
curl -X POST http://localhost:8000/api/music/upload/{PROJECT_ID} \
  -F "file=@/path/to/song.mp3"
```

## Analyze Beat/Rhythm (Librosa)

Run AI beat detection on a track:
```bash
curl -X POST http://localhost:8000/api/music/{MUSIC_ID}/analyze | python3 -m json.tool
```

Returns:
- **bpm**: Beats per minute
- **beats**: Array of beat timestamps (seconds)
- **onsets**: Array of onset timestamps (note attack points)
- **sections**: Array of section boundaries (structural changes)
- **strength_curve**: Downsampled energy curve (~200 points)

## Get Single Track Details

```bash
curl -s http://localhost:8000/api/music/{MUSIC_ID} | python3 -m json.tool
```

## Delete a Track

```bash
curl -X DELETE http://localhost:8000/api/music/{MUSIC_ID}
```

## Content Understanding (by Name)

Music tracks have descriptive titles like `纯音乐/The Back Ground Story - Jeff Broadbent` or `Vlog、旅拍、抖音、短视频背景配乐BGM/slow motion - StrawberryPapa`.

You MUST analyze the **title, artist, folder, BPM, and duration** to infer:

1. **Mood**: calm, epic, upbeat, melancholic, energetic, romantic, mysterious, playful
2. **Genre**: cinematic, electronic, acoustic, orchestral, pop, rock, ambient, piano
3. **Best scenes**: landscape, cityscape, action, food, travel, portrait, night, sunset
4. **Energy level**: low (ambient/piano) → medium (acoustic/folk) → high (electronic/rock)

### Title Clues

| Keyword in title | Inferred mood/genre |
|-----------------|---------------------|
| Courage, War, Battle, Hero, Fire | epic, orchestral, high energy |
| Dream, Cloud, Sky, Star, Light | calm, ambient, cinematic |
| Smile, Laugh, Happy, Fun | upbeat, playful, light |
| Slow, Gentle, Quiet, 寂寞, 花 | calm, acoustic, low energy |
| Travel, Trip, Journey, Traverse | adventurous, medium energy |
| 沸き上がる, 闘志, 斗志 | epic, dramatic, high energy |

### Artist Clues

| Artist | Known style |
|--------|------------|
| Two Steps From Hell | Epic orchestral/cinematic |
| Hans Zimmer | Cinematic, dramatic |
| X-Ray Dog | Trailer music, epic |
| Audiomachine | Cinematic, powerful |
| Jeff Broadbent | Cinematic, emotional |
| Axero | Chill electronic |
| StrawberryPapa | Lo-fi, chill |
| CMA | Electronic, ambient |

### Folder Clues

| Folder | Meaning |
|--------|---------|
| `纯音乐/` | Pure instrumental — often cinematic/orchestral |
| `Vlog、旅拍、抖音、短视频背景配乐BGM/` | Vlog/travel background music — lighter, modern |
| `2025douyin/` | TikTok trending — pop, vocal, short-form |

### Selection Logic

When choosing music for a timeline:
1. Parse title + artist + folder to infer mood and energy
2. Match against the video clips' `mood` and `scene_type` from AI analysis
3. Consider BPM: low BPM for calm scenes, high BPM for action/epic
4. Consider duration: pick tracks close to the timeline's total duration
5. Prefer analyzed tracks (with BPM/beats) over unanalyzed ones

Example reasoning:
> Video clips are Golden Gate Bridge at sunset (mood=calm, scene=landscape).
> → Need calm/cinematic music, low-medium BPM.
> → "The Back Ground Story - Jeff Broadbent" (cinematic artist, 40s, BPM ~70) ✓
> → "Heart of Courage - Two Steps From Hell" (epic, too intense) ✗

## Mood Matching Reference

| Video Mood | Music Style | BPM Range |
|------------|-------------|-----------|
| happy, fun | Upbeat pop, electronic | 110-140 |
| peaceful, calm | Ambient, acoustic | 60-90 |
| dramatic, epic | Orchestral, cinematic | 80-120 |
| romantic | Piano, strings | 70-100 |
| adventurous | Rock, electronic | 120-150 |
| nostalgic | Acoustic, folk | 80-110 |

### Using Beat Data for Timeline Editing

1. **Beat timestamps** → Natural cut points for video clips
2. **Sections** → Structure the timeline (intro, verse, chorus = different locations)
3. **BPM** → Control clip duration:
   - 120 BPM = 0.5s per beat → clips of 2-4 beats = 1-2s
   - 80 BPM = 0.75s per beat → clips of 4-8 beats = 3-6s
4. **Onsets** → More granular cut points for fast-paced edits

### Setting Music on a Timeline

```bash
curl -X PUT http://localhost:8000/api/timelines/{TIMELINE_ID}/music \
  -H "Content-Type: application/json" \
  -d '[{
    "music_id": {MUSIC_ID},
    "start_time": 0,
    "end_time": 30.0,
    "volume": 0.7,
    "fade_in": 1.5,
    "fade_out": 2.0
  }]'
```

## Workflow

1. List existing music → check if any are already analyzed
2. If none, scan the music directory or ask user to upload
3. Analyze beats for candidate tracks
4. Review BPM and mood to match the video content
5. Recommend a track to the user with reasoning
6. Apply to timeline using `/clipmind-timeline` skill
