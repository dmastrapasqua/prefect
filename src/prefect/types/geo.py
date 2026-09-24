from typing import Annotated, Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# GeoJSON position: (longitude, latitude), EPSG:4326
Position = tuple[
    Annotated[float, Field(ge=-180, le=180)],
    Annotated[float, Field(ge=-90, le=90)],
]


class Polygon(BaseModel):
    """A GeoJSON Polygon: an outer ring, optionally followed by holes."""

    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[Position]] = Field(min_length=1)

    @field_validator("coordinates")
    @classmethod
    def validate_rings(cls, rings: list[list[Position]]) -> list[list[Position]]:
        for ring in rings:
            if len(ring) < 4:
                raise ValueError("each ring must have at least 4 positions")
            if ring[0] != ring[-1]:
                raise ValueError("each ring must be closed (first position equal to last)")
        return rings


class Feature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: Polygon
    properties: dict[str, Any] | None = None


class FeatureCollection(BaseModel):
    """A GeoJSON FeatureCollection of polygons in longitude/latitude."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        json_schema_extra={"x-prefect-ui-widget": "feature-collection"},
    )

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[Feature] = Field(min_length=1)

    def bounds(self) -> tuple[float, float, float, float]:
        """(west, south, east, north) covering all features."""
        positions = [
            p for f in self.features for ring in f.geometry.coordinates for p in ring
        ]
        lons = [lon for lon, _ in positions]
        lats = [lat for _, lat in positions]
        return min(lons), min(lats), max(lons), max(lats)
