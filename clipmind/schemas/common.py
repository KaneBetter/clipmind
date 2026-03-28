from enum import Enum
from pydantic import BaseModel


class SceneCategory(str, Enum):
    landscape = "landscape"
    people = "people"
    food = "food"
    transport = "transport"
    accommodation = "accommodation"
    activity = "activity"
    cityscape = "cityscape"
    wildlife = "wildlife"
    other = "other"


class Mood(str, Enum):
    epic = "epic"
    warm = "warm"
    joyful = "joyful"
    calm = "calm"
    tense = "tense"
    melancholy = "melancholy"
    adventurous = "adventurous"
    other = "other"


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    pages: int
