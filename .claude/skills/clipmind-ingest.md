---
name: clipmind-ingest
description: Import videos, cluster GPS locations, and name locations with reverse geocoding. Preprocesses video metadata for the ClipMind project.
---

# ClipMind Ingest — Import & Location Preprocessing

You help the user import videos into ClipMind and preprocess location data (GPS clustering + naming).

## Step 1: Check Project

```bash
curl -s http://localhost:8000/api/projects | python3 -m json.tool
```

If no project exists, create one:
```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "项目名称",
    "video_dir": "/path/to/videos",
    "photo_dir": "/path/to/photos",
    "music_dir": "/path/to/music"
  }'
```

## Step 2: Trigger Video Import

```bash
# Start background import (videos only, parallel with 8 workers)
curl -X POST http://localhost:8000/api/ingest/{PROJECT_ID}

# Poll progress
curl -s http://localhost:8000/api/ingest/progress/{PROJECT_ID}
```

Wait until `status` is `completed`.

## Step 3: Cluster GPS Locations

After import, cluster videos by GPS:

```bash
# eps_km controls cluster radius: 2-5 km is typical for travel
curl -X POST "http://localhost:8000/api/videos/cluster-locations/{PROJECT_ID}?eps_km=5"
```

This returns clusters like `{"label": "Location 1", "count": 88, "centroid_lat": 36.112, "centroid_lon": -115.172}`.

## Step 4: Name Locations with Reverse Geocoding

The clusters are named "Location 1", "Location 2" etc. You should **rename them to real place names** using reverse geocoding.

For each cluster centroid, use the Nominatim API:

```bash
# Example: reverse geocode a centroid
curl -s "https://nominatim.openstreetmap.org/reverse?lat=36.112&lon=-115.172&format=json&zoom=14" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('display_name','unknown'))"
```

Parse the response to extract a short, meaningful name:
- Use `address.tourism` or `address.leisure` if available (e.g. "Bryce Canyon")
- Fallback to `address.city` or `address.town`
- Fallback to `address.county`
- Keep names short (2-3 words max)

Then update each video's location_label. You can do this with SQL:

```bash
# After determining "Location 3" centroid is at Bryce Canyon:
sqlite3 data/clipmind.db "UPDATE videos SET location_label = 'Bryce Canyon' WHERE location_label = 'Location 3' AND project_id = {PROJECT_ID};"
```

Or use the cluster endpoint again with custom names (via the API if available).

## Step 5: Verify

```bash
# Check location distribution
curl -s http://localhost:8000/api/videos/locations/{PROJECT_ID} | python3 -m json.tool
```

## Important Notes

- **Rate limit**: Nominatim requires max 1 request/second. Add `sleep 1` between calls.
- **User-Agent**: Nominatim requires a User-Agent header. Use: `"ClipMind/1.0"`
- **Only name the top clusters**: If there are 100+ clusters, focus on the top 20-30 by size.
- **Ask the user** if the names look right before proceeding.

## Workflow Summary

1. Create/check project with video/photo/music dirs
2. Trigger ingest → wait for completion
3. Cluster GPS locations (DBSCAN, 5km radius)
4. Reverse geocode top clusters → rename locations
5. Show results to user for confirmation
