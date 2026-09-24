import type { PointerEvent as ReactPointerEvent } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
import {
	bboxToFeatureCollection,
	featureCollectionToBBox,
	isFeatureCollection,
} from "./utilities/geojson";

type BBoxValue = {
	west: number;
	south: number;
	east: number;
	north: number;
};

type BBoxField = keyof BBoxValue;

// What the user has typed in the four number inputs. Kept as strings so
// partially typed values ("-", "12.") survive until they become valid.
type BBoxDraft = Record<BBoxField, string>;

type FeatureCollectionInputProps = {
	value: unknown;
	onValueChange: (value: unknown) => void;
	id: string;
};

type Dimensions = {
	width: number;
	height: number;
};

type MapView = {
	centerLon: number;
	centerLat: number;
	zoom: number;
};

type Interaction =
	| {
			mode: "select";
			pointerId: number;
			startCoordinate: Coordinate;
	  }
	| {
			mode: "pan";
			pointerId: number;
			startClientX: number;
			startClientY: number;
			startCenterWorldX: number;
			startCenterWorldY: number;
	  };

type Coordinate = {
	lon: number;
	lat: number;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const DEFAULT_DIMENSIONS = { width: 500, height: 280 };
const DEFAULT_VIEW: MapView = {
	centerLon: 0,
	centerLat: 20,
	zoom: MIN_ZOOM,
};
const DEFAULT_BBOX: BBoxValue = {
	west: -10,
	south: -10,
	east: 10,
	north: 10,
};
const BBOX_FIELDS = [
	{
		key: "west",
		label: "West",
		ariaLabel: "West longitude",
		min: -180,
		max: 180,
	},
	{
		key: "south",
		label: "South",
		ariaLabel: "South latitude",
		min: -90,
		max: 90,
	},
	{
		key: "east",
		label: "East",
		ariaLabel: "East longitude",
		min: -180,
		max: 180,
	},
	{
		key: "north",
		label: "North",
		ariaLabel: "North latitude",
		min: -90,
		max: 90,
	},
] as const;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function roundCoordinate(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000;
}

function getWorldSize(zoom: number): number {
	return TILE_SIZE * 2 ** zoom;
}

function normalizeLongitude(value: number): number {
	const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
	return normalized === -180 ? 180 : normalized;
}

function lonToWorldX(lon: number, zoom: number): number {
	return ((lon + 180) / 360) * getWorldSize(zoom);
}

function latToWorldY(lat: number, zoom: number): number {
	const clampedLat = clamp(lat, -85.05112878, 85.05112878);
	const latRadians = (clampedLat * Math.PI) / 180;
	const mercator = Math.log(Math.tan(Math.PI / 4 + latRadians / 2)) / Math.PI;
	return ((1 - mercator) / 2) * getWorldSize(zoom);
}

function worldXToLon(x: number, zoom: number): number {
	const worldSize = getWorldSize(zoom);
	const wrappedX = ((x % worldSize) + worldSize) % worldSize;
	return (wrappedX / worldSize) * 360 - 180;
}

function worldYToLat(y: number, zoom: number): number {
	const worldSize = getWorldSize(zoom);
	const clampedY = clamp(y, 0, worldSize);
	const mercator = Math.PI * (1 - (2 * clampedY) / worldSize);
	return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

function toDraft(bbox: BBoxValue | undefined): BBoxDraft {
	return {
		west: bbox?.west.toString() ?? "",
		south: bbox?.south.toString() ?? "",
		east: bbox?.east.toString() ?? "",
		north: bbox?.north.toString() ?? "",
	};
}

function parseCoordinate(raw: string): number | undefined {
	if (raw.trim() === "") {
		return undefined;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? roundCoordinate(value) : undefined;
}

function parseDraft(draft: BBoxDraft): BBoxValue | undefined {
	const west = parseCoordinate(draft.west);
	const south = parseCoordinate(draft.south);
	const east = parseCoordinate(draft.east);
	const north = parseCoordinate(draft.north);

	if (
		west === undefined ||
		south === undefined ||
		east === undefined ||
		north === undefined
	) {
		return undefined;
	}

	return { west, south, east, north };
}

function isRenderableBBox(bbox: BBoxValue | undefined): bbox is BBoxValue {
	return Boolean(bbox && bbox.west <= bbox.east && bbox.south <= bbox.north);
}

function normalizeBBox(a: Coordinate, b: Coordinate): BBoxValue {
	return {
		west: roundCoordinate(Math.min(a.lon, b.lon)),
		south: roundCoordinate(Math.min(a.lat, b.lat)),
		east: roundCoordinate(Math.max(a.lon, b.lon)),
		north: roundCoordinate(Math.max(a.lat, b.lat)),
	};
}

function createInitialView(bbox: BBoxValue | undefined): MapView {
	if (!isRenderableBBox(bbox)) {
		return DEFAULT_VIEW;
	}

	return fitBBoxToView(bbox, DEFAULT_DIMENSIONS);
}

function fitBBoxToView(bbox: BBoxValue, dimensions: Dimensions): MapView {
	const centerLon = (bbox.west + bbox.east) / 2;
	const centerLat = (bbox.south + bbox.north) / 2;
	const padding = 72;
	const targetWidth = Math.max(dimensions.width - padding, 1);
	const targetHeight = Math.max(dimensions.height - padding, 1);

	for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
		const westX = lonToWorldX(bbox.west, zoom);
		const eastX = lonToWorldX(bbox.east, zoom);
		const northY = latToWorldY(bbox.north, zoom);
		const southY = latToWorldY(bbox.south, zoom);

		if (eastX - westX <= targetWidth && southY - northY <= targetHeight) {
			return { centerLon, centerLat, zoom };
		}
	}

	return { centerLon, centerLat, zoom: MIN_ZOOM };
}

function getViewBounds(view: MapView, dimensions: Dimensions) {
	const centerWorldX = lonToWorldX(view.centerLon, view.zoom);
	const centerWorldY = latToWorldY(view.centerLat, view.zoom);

	return {
		topLeftX: centerWorldX - dimensions.width / 2,
		topLeftY: centerWorldY - dimensions.height / 2,
	};
}

function getCoordinateFromPointer(
	event: ReactPointerEvent<HTMLDivElement>,
	view: MapView,
	dimensions: Dimensions,
): Coordinate {
	const rect = event.currentTarget.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;
	const { topLeftX, topLeftY } = getViewBounds(view, dimensions);

	return {
		lon: roundCoordinate(worldXToLon(topLeftX + x, view.zoom)),
		lat: roundCoordinate(worldYToLat(topLeftY + y, view.zoom)),
	};
}

function projectCoordinate(
	coordinate: Coordinate,
	view: MapView,
	dimensions: Dimensions,
): { x: number; y: number } {
	const { topLeftX, topLeftY } = getViewBounds(view, dimensions);

	return {
		x: lonToWorldX(coordinate.lon, view.zoom) - topLeftX,
		y: latToWorldY(coordinate.lat, view.zoom) - topLeftY,
	};
}

function getTileDescriptors(view: MapView, dimensions: Dimensions) {
	const { topLeftX, topLeftY } = getViewBounds(view, dimensions);
	const tileCount = 2 ** view.zoom;
	const minTileX = Math.floor(topLeftX / TILE_SIZE);
	const maxTileX = Math.floor((topLeftX + dimensions.width) / TILE_SIZE);
	const minTileY = Math.max(0, Math.floor(topLeftY / TILE_SIZE));
	const maxTileY = Math.min(
		tileCount - 1,
		Math.floor((topLeftY + dimensions.height) / TILE_SIZE),
	);
	const tiles: {
		key: string;
		x: number;
		y: number;
		left: number;
		top: number;
		url: string;
	}[] = [];

	for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
		const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
		for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
			tiles.push({
				key: `${view.zoom}-${tileX}-${tileY}`,
				x: wrappedX,
				y: tileY,
				left: tileX * TILE_SIZE - topLeftX,
				top: tileY * TILE_SIZE - topLeftY,
				url: `https://tile.openstreetmap.org/${view.zoom}/${wrappedX}/${tileY}.png`,
			});
		}
	}

	return tiles;
}

function useElementDimensions() {
	const ref = useRef<HTMLDivElement | null>(null);
	const [dimensions, setDimensions] = useState<Dimensions>(DEFAULT_DIMENSIONS);

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) {
			return;
		}

		function updateDimensions(target: HTMLDivElement) {
			const rect = target.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				setDimensions({ width: rect.width, height: rect.height });
			}
		}

		updateDimensions(element);

		const observer = new ResizeObserver(() => updateDimensions(element));
		observer.observe(element);

		return () => observer.disconnect();
	}, []);

	return { ref, dimensions };
}

function ToolButton({
	label,
	active,
	onClick,
	icon,
}: {
	label: string;
	active?: boolean;
	onClick: () => void;
	icon: "Crosshair" | "Move" | "Plus" | "Minus" | "RefreshCw";
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					size="icon"
					variant={active ? "default" : "outline"}
					aria-label={label}
					onClick={onClick}
				>
					<Icon id={icon} className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function BBoxMap({
	bbox,
	onBBoxChange,
	onClear,
}: {
	bbox: BBoxValue | undefined;
	onBBoxChange: (bbox: BBoxValue) => void;
	onClear: () => void;
}) {
	const { ref, dimensions } = useElementDimensions();
	const [view, setView] = useState(() => createInitialView(bbox));
	const [mode, setMode] = useState<"select" | "pan">("select");
	const interaction = useRef<Interaction | null>(null);
	const renderableBBox = isRenderableBBox(bbox) ? bbox : undefined;
	const tiles = useMemo(
		() => getTileDescriptors(view, dimensions),
		[view, dimensions],
	);
	const overlay = useMemo(() => {
		if (!renderableBBox) {
			return undefined;
		}

		const northwest = projectCoordinate(
			{ lon: renderableBBox.west, lat: renderableBBox.north },
			view,
			dimensions,
		);
		const southeast = projectCoordinate(
			{ lon: renderableBBox.east, lat: renderableBBox.south },
			view,
			dimensions,
		);

		return {
			left: Math.min(northwest.x, southeast.x),
			top: Math.min(northwest.y, southeast.y),
			width: Math.abs(southeast.x - northwest.x),
			height: Math.abs(southeast.y - northwest.y),
		};
	}, [renderableBBox, view, dimensions]);

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		event.currentTarget.setPointerCapture(event.pointerId);

		if (mode === "pan") {
			interaction.current = {
				mode,
				pointerId: event.pointerId,
				startClientX: event.clientX,
				startClientY: event.clientY,
				startCenterWorldX: lonToWorldX(view.centerLon, view.zoom),
				startCenterWorldY: latToWorldY(view.centerLat, view.zoom),
			};
			return;
		}

		const startCoordinate = getCoordinateFromPointer(event, view, dimensions);
		interaction.current = {
			mode,
			pointerId: event.pointerId,
			startCoordinate,
		};
		onBBoxChange(normalizeBBox(startCoordinate, startCoordinate));
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		const currentInteraction = interaction.current;
		if (
			!currentInteraction ||
			currentInteraction.pointerId !== event.pointerId
		) {
			return;
		}

		if (currentInteraction.mode === "pan") {
			const dx = event.clientX - currentInteraction.startClientX;
			const dy = event.clientY - currentInteraction.startClientY;
			const worldSize = getWorldSize(view.zoom);
			const nextWorldX = currentInteraction.startCenterWorldX - dx;
			const nextWorldY = clamp(
				currentInteraction.startCenterWorldY - dy,
				0,
				worldSize,
			);

			setView((current) => ({
				...current,
				centerLon: normalizeLongitude(worldXToLon(nextWorldX, current.zoom)),
				centerLat: worldYToLat(nextWorldY, current.zoom),
			}));
			return;
		}

		const currentCoordinate = getCoordinateFromPointer(event, view, dimensions);
		onBBoxChange(
			normalizeBBox(currentInteraction.startCoordinate, currentCoordinate),
		);
	}

	function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
		if (interaction.current?.pointerId === event.pointerId) {
			interaction.current = null;
		}
	}

	function zoomBy(delta: number) {
		setView((current) => ({
			...current,
			zoom: clamp(current.zoom + delta, MIN_ZOOM, MAX_ZOOM),
		}));
	}

	function fitSelection() {
		if (!renderableBBox) {
			return;
		}

		setView(fitBBoxToView(renderableBBox, dimensions));
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					<ToolButton
						label="Select area"
						icon="Crosshair"
						active={mode === "select"}
						onClick={() => setMode("select")}
					/>
					<ToolButton
						label="Move map"
						icon="Move"
						active={mode === "pan"}
						onClick={() => setMode("pan")}
					/>
				</div>
				<div className="flex items-center gap-1">
					<ToolButton label="Zoom in" icon="Plus" onClick={() => zoomBy(1)} />
					<ToolButton
						label="Zoom out"
						icon="Minus"
						onClick={() => zoomBy(-1)}
					/>
					<ToolButton
						label="Fit selected area"
						icon="Crosshair"
						onClick={fitSelection}
					/>
					<ToolButton
						label="Clear selected area"
						icon="RefreshCw"
						onClick={onClear}
					/>
				</div>
			</div>
			<div
				ref={ref}
				className={cn(
					"relative h-[280px] overflow-hidden rounded-md border bg-muted select-none",
					mode === "pan"
						? "cursor-grab active:cursor-grabbing"
						: "cursor-crosshair",
				)}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				role="application"
				aria-label="Bounding box map"
			>
				{tiles.map((tile) => (
					<img
						key={tile.key}
						src={tile.url}
						alt=""
						draggable={false}
						className="absolute size-64 max-w-none"
						style={{
							left: tile.left,
							top: tile.top,
						}}
					/>
				))}
				{overlay && (
					<div
						className="pointer-events-none absolute border-2 border-primary bg-primary/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
						style={{
							left: overlay.left,
							top: overlay.top,
							width: overlay.width,
							height: overlay.height,
						}}
					/>
				)}
				<div className="absolute bottom-1 right-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-xs">
					&copy; OpenStreetMap
				</div>
			</div>
		</div>
	);
}

export function SchemaFormInputFeatureCollection({
	value,
	onValueChange,
	id,
}: FeatureCollectionInputProps) {
	// The form value is a GeoJSON FeatureCollection; the map and the inputs
	// work on its bounding box.
	const bbox = isFeatureCollection(value)
		? featureCollectionToBBox(value)
		: undefined;
	const [draft, setDraft] = useState<BBoxDraft>(() => toDraft(bbox));

	// Used by the map, the clear button and the default-area button.
	function setBBox(next: BBoxValue | undefined) {
		setDraft(toDraft(next));
		onValueChange(next ? bboxToFeatureCollection(next) : undefined);
	}

	// Used by the four number inputs. Only a complete, valid box becomes a
	// FeatureCollection; anything else leaves the parameter empty.
	function handleFieldChange(field: BBoxField, rawValue: string) {
		const nextDraft = { ...draft, [field]: rawValue };
		setDraft(nextDraft);

		const next = parseDraft(nextDraft);
		onValueChange(
			isRenderableBBox(next) ? bboxToFeatureCollection(next) : undefined,
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<BBoxMap
				bbox={bbox}
				onBBoxChange={setBBox}
				onClear={() => setBBox(undefined)}
			/>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
				{BBOX_FIELDS.map((field) => {
					const inputId = `${id}-${field.key}`;
					return (
						<label
							key={field.key}
							htmlFor={inputId}
							className="flex flex-col gap-1 text-sm"
						>
							<span className="text-muted-foreground">{field.label}</span>
							<Input
								id={inputId}
								type="number"
								inputMode="decimal"
								min={field.min}
								max={field.max}
								step="any"
								value={draft[field.key]}
								aria-label={field.ariaLabel}
								onChange={(event) =>
									handleFieldChange(field.key, event.target.value)
								}
							/>
						</label>
					);
				})}
			</div>
			{!bbox && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="w-fit"
					onClick={() => setBBox(DEFAULT_BBOX)}
				>
					<Icon id="Crosshair" className="mr-2 size-4" />
					Set default area
				</Button>
			)}
		</div>
	);
}