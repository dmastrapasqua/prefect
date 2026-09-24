import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SchemaFormInputFeatureCollection } from "./schema-form-input-feature-collection.tsx";
import {
	bboxToFeatureCollection,
	featureCollectionToBBox,
	isFeatureCollection,
} from "./utilities/geojson";

const VALUE = bboxToFeatureCollection({
	west: -10,
	south: -20,
	east: 30,
	north: 40,
});

beforeEach(() => {
	HTMLElement.prototype.setPointerCapture = vi.fn();
});

describe("SchemaFormInputFeatureCollection", () => {
	test("renders numeric bbox inputs from the current value", () => {
		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={vi.fn()}
			/>,
		);

		expect(screen.getByLabelText("West longitude")).toHaveValue(-10);
		expect(screen.getByLabelText("South latitude")).toHaveValue(-20);
		expect(screen.getByLabelText("East longitude")).toHaveValue(30);
		expect(screen.getByLabelText("North latitude")).toHaveValue(40);
	});

	test("updates a single coordinate from the numeric inputs", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={onValueChange}
			/>,
		);

		fireEvent.change(screen.getByLabelText("East longitude"), {
			target: { value: "42.5" },
		});

		expect(onValueChange).toHaveBeenCalledWith(
			bboxToFeatureCollection({ west: -10, south: -20, east: 42.5, north: 40 }),
		);
	});

	test("clears the value while a coordinate is incomplete", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={onValueChange}
			/>,
		);

		fireEvent.change(screen.getByLabelText("East longitude"), {
			target: { value: "" },
		});

		expect(onValueChange).toHaveBeenLastCalledWith(undefined);
		expect(screen.getByLabelText("East longitude")).toHaveValue(null);
	});

	test("sets a default area when there is no value", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={undefined}
				onValueChange={onValueChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Set default area" }));

		expect(onValueChange).toHaveBeenCalledWith(
			bboxToFeatureCollection({ west: -10, south: -10, east: 10, north: 10 }),
		);
	});

	test("clears the selected area", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={VALUE}
				onValueChange={onValueChange}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Clear selected area" }),
		);

		expect(onValueChange).toHaveBeenLastCalledWith(undefined);
	});

	test("selects a bbox by dragging on the map", () => {
		const onValueChange = vi.fn();

		render(
			<SchemaFormInputFeatureCollection
				id="aoi"
				value={undefined}
				onValueChange={onValueChange}
			/>,
		);

		const map = screen.getByRole("application", { name: "Bounding box map" });
		fireEvent.pointerDown(map, { pointerId: 1, clientX: 100, clientY: 100 });
		fireEvent.pointerMove(map, { pointerId: 1, clientX: 250, clientY: 180 });
		fireEvent.pointerUp(map, { pointerId: 1, clientX: 250, clientY: 180 });

		const selected: unknown = onValueChange.mock.calls.at(-1)?.[0];
		expect(isFeatureCollection(selected)).toBe(true);

		const bbox = isFeatureCollection(selected)
			? featureCollectionToBBox(selected)
			: undefined;

		expect(bbox).toBeDefined();
		expect(bbox?.west).toBeLessThan(bbox?.east ?? 0);
		expect(bbox?.south).toBeLessThan(bbox?.north ?? 0);
	});
});
