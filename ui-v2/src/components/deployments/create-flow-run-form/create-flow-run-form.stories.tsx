import type { Meta, StoryObj } from "@storybook/react";
import { buildApiUrl } from "@tests/utils/handlers";
import { HttpResponse, http } from "msw";
import {
	createFakeDeployment,
	createFakeFlowRun,
	createFakeWorkPool,
	createFakeWorkQueue,
} from "@/mocks";
import {
	reactQueryDecorator,
	routerDecorator,
	toastDecorator,
} from "@/storybook/utils";
import { CreateFlowRunForm } from "./create-flow-run-form";

const MOCK_WORK_POOLS_DATA = Array.from({ length: 5 }, createFakeWorkPool);
const MOCK_WORK_QUEUES_DATA = Array.from({ length: 5 }, () =>
	createFakeWorkQueue({ work_pool_name: "my-work-pool" }),
);
const meta = {
	title: "Components/Deployments/CreateFlowRunForm",
	decorators: [routerDecorator, toastDecorator, reactQueryDecorator],
	component: CreateFlowRunForm,
	args: {
		deployment: createFakeDeployment({ work_pool_name: "my-work-pool" }),
		overrideParameters: undefined,
	},
	parameters: {
		msw: {
			handlers: [
				http.post(buildApiUrl("/work_pools/filter"), () => {
					return HttpResponse.json(MOCK_WORK_POOLS_DATA);
				}),
				http.post(
					buildApiUrl("/work_pools/:work_pool_name/queues/filter"),
					() => {
						return HttpResponse.json(MOCK_WORK_QUEUES_DATA);
					},
				),
				http.post(buildApiUrl("/deployments/:id/create_flow_run"), () => {
					return HttpResponse.json(createFakeFlowRun());
				}),
			],
		},
	},
} satisfies Meta<typeof CreateFlowRunForm>;

export default meta;

export const Story: StoryObj = {
	name: "CreateFlowRunForm",
};

export const WithBBoxParameter: StoryObj<typeof meta> = {
	args: {
		overrideParameters: undefined,
		deployment: createFakeDeployment({
			work_pool_name: "my-work-pool",
			parameters: {
				aoi: {
					west: -74.25909,
					south: 40.477399,
					east: -73.700272,
					north: 40.917577,
				},
			},
			parameter_openapi_schema: {
				title: "Parameters",
				type: "object",
				properties: {
					aoi: {
						$ref: "#/definitions/BBox",
						title: "Area of Interest",
					},
				},
				required: ["aoi"],
				definitions: {
					BBox: {
						title: "BBox",
						type: "object",
						"x-prefect-ui-widget": "bbox",
						properties: {
							west: { type: "number", title: "West" },
							south: { type: "number", title: "South" },
							east: { type: "number", title: "East" },
							north: { type: "number", title: "North" },
						},
						required: ["west", "south", "east", "north"],
					},
				},
			},
			enforce_parameter_schema: true,
		}),
	},
};
