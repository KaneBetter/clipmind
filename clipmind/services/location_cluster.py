"""GPS location clustering using DBSCAN to group nearby videos."""

import logging
import math

import numpy as np
from sklearn.cluster import DBSCAN

from sqlalchemy.orm import Session

from clipmind.models.video import Video

logger = logging.getLogger(__name__)

EARTH_RADIUS = 6371.0  # km


def cluster_locations(
    db: Session,
    project_id: int,
    eps_km: float = 2.0,
    min_samples: int = 2,
) -> dict:
    """Cluster videos by GPS using DBSCAN with haversine distance.

    DBSCAN propagates clusters through chains of nearby points,
    so a spread-out area like a national park gets one cluster.
    """
    videos = (
        db.query(Video)
        .filter(
            Video.project_id == project_id,
            Video.lat.isnot(None),
            Video.lon.isnot(None),
        )
        .order_by(Video.captured_at.asc().nullslast(), Video.id.asc())
        .all()
    )

    if not videos:
        return {"clustered": 0, "clusters": 0, "no_gps": 0, "locations": []}

    # Convert to radians for haversine
    coords = np.array([[math.radians(v.lat), math.radians(v.lon)] for v in videos])

    # DBSCAN with haversine metric — eps in radians
    eps_rad = eps_km / EARTH_RADIUS
    db_scan = DBSCAN(eps=eps_rad, min_samples=min_samples, metric="haversine")
    labels = db_scan.fit_predict(coords)

    # Build cluster info
    cluster_map: dict[int, list[int]] = {}
    for i, label in enumerate(labels):
        if label == -1:
            # Noise point — assign its own cluster
            new_label = max(cluster_map.keys(), default=-1) + 1
            cluster_map[new_label] = [i]
        else:
            cluster_map.setdefault(label, []).append(i)

    # Sort by size (largest first)
    sorted_clusters = sorted(cluster_map.values(), key=len, reverse=True)

    cluster_info = []
    for idx, indices in enumerate(sorted_clusters):
        lats = [videos[i].lat for i in indices]
        lons = [videos[i].lon for i in indices]
        centroid_lat = sum(lats) / len(lats)
        centroid_lon = sum(lons) / len(lons)

        label = f"Location {idx + 1}"

        for i in indices:
            videos[i].location_label = label

        cluster_info.append({
            "label": label,
            "count": len(indices),
            "centroid_lat": round(centroid_lat, 6),
            "centroid_lon": round(centroid_lon, 6),
        })

    no_gps = (
        db.query(Video)
        .filter(Video.project_id == project_id, Video.lat.is_(None))
        .count()
    )

    db.commit()

    logger.info(
        "Clustered %d videos into %d locations for project %d",
        len(videos), len(sorted_clusters), project_id,
    )

    return {
        "clustered": len(videos),
        "clusters": len(sorted_clusters),
        "no_gps": no_gps,
        "locations": cluster_info,
    }
