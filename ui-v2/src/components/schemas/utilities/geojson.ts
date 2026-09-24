export type BBox = { west: number; south: number; east: number; north: number };
type Position = [number, number];

export type PolygonFeature = {
	type: "Feature";
	properties: Record<string, unknown> | null;
	geometry: { type: "Polygon"; coordinates: Position[][] };
};

export type FeatureCollection = {
	type: "FeatureCollection";
	features: PolygonFeature[];
};

export function isFeatureCollection(value: unknown): value is FeatureCollection {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		value.type === "FeatureCollection" &&
		"features" in value &&
		Array.isArray(value.features)
	);
}

export function bboxToFeatureCollection({ west, south, east, north }: BBox): FeatureCollection {
	return {
		type: "FeatureCollection",
		features: [
			{
				type: "Feature",
				properties: {},
				geometry: {
					type: "Polygon",
					// counter-clockwise exterior ring, as RFC 7946 recommends
					coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
				},
			},
		],
	};
}

export function featureCollectionToBBox(collection: FeatureCollection): BBox | undefined {
	const positions = collection.features.flatMap((f) => f.geometry.coordinates.flat());
	if (positions.length === 0) {
		return undefined;
	}
	const lons = positions.map(([lon]) => lon);
	const lats = positions.map(([, lat]) => lat);
	return {
		west: Math.min(...lons),
		south: Math.min(...lats),
		east: Math.max(...lons),
		north: Math.max(...lats),
	};
}