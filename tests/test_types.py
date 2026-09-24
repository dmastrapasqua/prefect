from __future__ import annotations

import datetime
import sys
import types
import copy

import pytest
from pydantic import BaseModel, ValidationError

from prefect.types import FeatureCollection, KeyValueLabelsField, SecondsTimeDelta
from prefect.types import _datetime as datetime_types
from prefect.types._datetime import human_friendly_diff
from prefect.utilities.callables import parameter_schema


def test_allow_none_as_empty_dict():
    class Model(BaseModel):
        labels: KeyValueLabelsField

    assert Model(labels=None).labels == {}  # type: ignore[arg-type]


class MockOffsetTZInfo(datetime.tzinfo):
    """A minimal tzinfo subclass with a .name attribute holding an offset."""

    def __init__(self, name: str):
        self.name = name

    def utcoffset(self, dt: datetime.datetime | None) -> datetime.timedelta | None:
        if self.name.startswith("+"):
            sign = 1
        elif self.name.startswith("-"):
            sign = -1
        else:
            return None
        try:
            hours, minutes = map(int, self.name[1:].split(":"))
            return sign * datetime.timedelta(hours=hours, minutes=minutes)
        except ValueError:
            return None

    def dst(self, dt: datetime.datetime | None) -> datetime.timedelta | None:
        return None

    def tzname(self, dt: datetime.datetime | None) -> str | None:
        return self.name


def test_human_friendly_diff_with_offset_tzinfo():
    """Test that human_friendly_diff does not raise error with an offset tz name."""
    mock_tz = MockOffsetTZInfo(name="+05:30")
    dt_with_mock_offset = datetime.datetime.now().replace(tzinfo=mock_tz)

    # This call should raise ZoneInfoNotFoundError before the fix
    result = human_friendly_diff(dt_with_mock_offset)
    assert isinstance(result, str)


def test_seconds_timedelta_accepts_numeric_values():
    """Test that SecondsTimeDelta accepts numeric values as seconds."""

    class Model(BaseModel):
        duration: SecondsTimeDelta

    assert Model(duration=5).duration == datetime.timedelta(seconds=5)
    assert Model(duration="10").duration == datetime.timedelta(seconds=10)
    assert Model(duration="PT5S").duration == datetime.timedelta(seconds=5)


SQUARE = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-10, -5], [10, -5], [10, 5], [-10, 5], [-10, -5]]],
            },
        }
    ],
}


def test_feature_collection_validates_polygons():
    assert FeatureCollection.model_validate(SQUARE).bounds() == (-10, -5, 10, 5)

    open_ring = copy.deepcopy(SQUARE)
    open_ring["features"][0]["geometry"]["coordinates"][0].pop()
    with pytest.raises(ValidationError, match="must be closed"):
        FeatureCollection.model_validate(open_ring)

    with pytest.raises(ValidationError):
        FeatureCollection.model_validate({"type": "FeatureCollection", "features": []})


def test_feature_collection_parameter_schema_includes_ui_widget_marker():
    def flow(aoi: FeatureCollection):
        pass

    schema = parameter_schema(flow).model_dump_for_openapi()

    assert schema["properties"]["aoi"]["$ref"] == "#/definitions/FeatureCollection"
    assert (
        schema["definitions"]["FeatureCollection"]["x-prefect-ui-widget"]
        == "feature-collection"
    )


def test_now_uses_to_stdlib_on_python_313_plus(monkeypatch: pytest.MonkeyPatch):
    expected = datetime.datetime(2026, 4, 9, tzinfo=datetime.timezone.utc)

    class FakeZonedDateTimeResult:
        def to_stdlib(self) -> datetime.datetime:
            return expected

        def py_datetime(self) -> datetime.datetime:
            raise AssertionError("now() should not call py_datetime()")

    class FakeZonedDateTime:
        @staticmethod
        def now(tz: object) -> FakeZonedDateTimeResult:
            assert tz == "UTC"
            return FakeZonedDateTimeResult()

    monkeypatch.setattr(datetime_types.sys, "version_info", (3, 13))
    monkeypatch.setitem(
        sys.modules,
        "whenever",
        types.SimpleNamespace(ZonedDateTime=FakeZonedDateTime),
    )

    assert datetime_types.now("UTC") == expected


def test_now_falls_back_to_py_datetime_without_to_stdlib(
    monkeypatch: pytest.MonkeyPatch,
):
    expected = datetime.datetime(2026, 4, 9, tzinfo=datetime.timezone.utc)

    class FakeZonedDateTimeResult:
        def py_datetime(self) -> datetime.datetime:
            return expected

    class FakeZonedDateTime:
        @staticmethod
        def now(tz: object) -> FakeZonedDateTimeResult:
            assert tz == "UTC"
            return FakeZonedDateTimeResult()

    monkeypatch.setattr(datetime_types.sys, "version_info", (3, 13))
    monkeypatch.setitem(
        sys.modules,
        "whenever",
        types.SimpleNamespace(ZonedDateTime=FakeZonedDateTime),
    )

    assert datetime_types.now("UTC") == expected
