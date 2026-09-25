from typing import Annotated, Any, ClassVar, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

# GeoJSON position: (longitude, latitude), EPSG:4326
Longitude = Annotated[float, Field(ge=-180, le=180)]
Latitude = Annotated[float, Field(ge=-90, le=90)]
Position = tuple[Longitude, Latitude]


class Point(BaseModel):
    """A GeoJSON Point."""

    type: Literal["Point"] = "Point"
    coordinates: Position


class LineString(BaseModel):
    """A GeoJSON LineString: two or more positions."""

    type: Literal["LineString"] = "LineString"
    coordinates: list[Position] = Field(min_length=2)


class Polygon(BaseModel):
    """A GeoJSON Polygon.

    Rectangles and circles drawn in the UI are stored as polygons too
    (a circle is a many-sided polygon approximating it).
    """

    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[Position]] = Field(min_length=1)

    @field_validator("coordinates")
    @classmethod
    def validate_rings(cls, rings: list[list[Position]]) -> list[list[Position]]:
        """Validate rings.

        A polygon must have at least 4 rings (with the first one and last one the same).
        """
        for ring in rings:
            if len(ring) < 4:
                raise ValueError("each ring must have at least 4 positions")
            if ring[0] != ring[-1]:
                raise ValueError(
                    "each ring must be closed (first position equal to last)"
                )
        return rings


Geometry = Annotated[Union[Point, LineString, Polygon], Field(discriminator="type")]


class Feature(BaseModel):
    """Feature base model."""
    type: Literal["Feature"] = "Feature"
    id: str | int | None = None
    geometry: Geometry
    properties: dict[str, Any] | None = None


class FeatureCollection(BaseModel):
    """A GeoJSON FeatureCollection of points, lines and polygons (circles too) in lon/lat."""

    model_config: ClassVar[ConfigDict] = ConfigDict(
        json_schema_extra={"x-prefect-ui-widget": "feature-collection"},
    )

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[Feature] = Field(min_length=1)

    def positions(self) -> list[Position]:
        """Returns all the coordinates of all the features.

        Returns:
            list[Position]: list of positions
        """
        result: list[Position] = []
        for feature in self.features:
            geometry = feature.geometry
            if isinstance(geometry, Point):
                result.append(geometry.coordinates)
            elif isinstance(geometry, LineString):
                result.extend(geometry.coordinates)
            else:
                for ring in geometry.coordinates:
                    result.extend(ring)
        return result

    def bounds(self) -> tuple[float, float, float, float]:
        """Returns the bounds of the features.

        Returns:
            tuple[float, float, float, float]: bounds of the features
        """
        positions = self.positions()
        lons = [lon for lon, _ in positions]
        lats = [lat for _, lat in positions]
        return min(lons), min(lats), max(lons), max(lats)
