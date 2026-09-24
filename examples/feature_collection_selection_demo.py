from prefect import flow
from prefect.types import FeatureCollection

@flow(name="feature-collection-selection-demo", log_prints=True)
def feature_collection_selection_demo(aoi: FeatureCollection) -> dict:
    print(f"Selected area: {aoi.features} feature(s), bounds: {aoi.bounds()}")
    return aoi.model_dump(mode="json")


if __name__ == "__main__":
    feature_collection_selection_demo.serve(
        "feature-collection-selection-demo",
        tags=["feature-collection-demo", "ui-demo"],
        description="Demo flow for the feature collection selection widget.",
    )
