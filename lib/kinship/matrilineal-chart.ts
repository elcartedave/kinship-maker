import { DEFAULT_VIEWPORT } from "./constants";
import { buildChartDocumentSnapshot, createKinshipEdge, createKinshipNode } from "./document";
import { ChartDocument } from "./types";

const DX = 100;
const DY = 180;

/**
 * Matrilineal starter using standard kinship abbreviations:
 * M mother, F father, B brother, Z sister;
 * chains read outward (MMM = mother's mother's mother, MZS = mother's sister's son).
 */
export function createMatrilinealChartDocument(): ChartDocument {
	const y0 = 20;
	const y1 = y0 + DY;
	const y2 = y1 + DY;
	const y3 = y2 + DY;

	// Top generation
	const mmmX = 900;
	const mmfX = mmmX + DX;

	// Second generation
	const mmX = 750;
	const mfX = mmX + DX;
	const mmzX = 1050;
	const mmbX = 1200;

	// Parent generation
	const mzX = 950;
	const mzhX = mzX + DX;
	const mX = 700;
	const fX = mX + DX;
	const mbX = 1150;
	const mbwX = mbX + DX;

	// Ego generation
	const mid = mX + DX * 0.45;

	const egoX = mid + 0;
	const bX = egoX - DX;
	const zX = egoX + DX;

	const mzsX = mzX + DX * 0.5;
	const mbsX = mbX + DX * 0.5;

	const nodes = [	
		createKinshipNode({ id: "mmm", symbolType: "female", label: "MMM", x: mmmX, y: y0 }),
		createKinshipNode({ id: "mmf", symbolType: "male", label: "MMF", x: mmfX, y: y0 }),

		createKinshipNode({ id: "mm", symbolType: "female", label: "MM", x: mmX, y: y1 }),
		createKinshipNode({ id: "mf", symbolType: "male", label: "MF", x: mfX, y: y1 }),
		createKinshipNode({ id: "mmz", symbolType: "female", label: "MMZ", x: mmzX, y: y1 }),
		createKinshipNode({ id: "mmb", symbolType: "male", label: "MMB", x: mmbX, y: y1 }),

		createKinshipNode({ id: "mz", symbolType: "female", label: "MZ", x: mzX, y: y2 }),
		createKinshipNode({ id: "mzh", symbolType: "male", label: "MZH", x: mzhX, y: y2 }),

		createKinshipNode({ id: "m", symbolType: "female", label: "M", x: mX, y: y2 }),
		createKinshipNode({ id: "f", symbolType: "male", label: "F", x: fX, y: y2 }),

		createKinshipNode({ id: "mb", symbolType: "male", label: "MB", x: mbX, y: y2 }),
		createKinshipNode({ id: "mbw", symbolType: "female", label: "MBW", x: mbwX, y: y2 }),

		createKinshipNode({ id: "ego", symbolType: "male-ego", label: "Ego", x: egoX, y: y3 }),
		createKinshipNode({ id: "b", symbolType: "male", label: "B", x: bX , y: y3 }),
		createKinshipNode({ id: "z", symbolType: "female", label: "Z", x: zX, y: y3 }),

		createKinshipNode({ id: "mzs", symbolType: "male", label: "MZS", x: mzsX, y: y3 }),
		createKinshipNode({ id: "mbs", symbolType: "male", label: "MBS", x: mbsX, y: y3 }),
	];

	const edges = [
		// MMM + MMF
		createKinshipEdge({
			id: "e-mmm-mmf",
			source: "mmm",
			sourceHandle: "right",
			target: "mmf",
			targetHandle: "left",
			relationshipType: "married",
		}),

		...(["mm", "mmz", "mmb"] as const).flatMap((child) => [
			createKinshipEdge({
				id: `e-mmm-${child}`,
				source: "mmm",
				sourceHandle: "bottom",
				target: child,
				targetHandle: "top",
				relationshipType: "descended-from",
			}),
			createKinshipEdge({
				id: `e-mmf-${child}`,
				source: "mmf",
				sourceHandle: "bottom",
				target: child,
				targetHandle: "top",
				relationshipType: "descended-from",
			}),
		]),

		// MM + MF
		createKinshipEdge({
			id: "e-mm-mf",
			source: "mm",
			sourceHandle: "right",
			target: "mf",
			targetHandle: "left",
			relationshipType: "married",
		}),

		...(["m", "mz", "mb"] as const).flatMap((child) => [
			createKinshipEdge({
				id: `e-mm-${child}`,
				source: "mm",
				sourceHandle: "bottom",
				target: child,
				targetHandle: "top",
				relationshipType: "descended-from",
			}),
			createKinshipEdge({
				id: `e-mf-${child}`,
				source: "mf",
				sourceHandle: "bottom",
				target: child,
				targetHandle: "top",
				relationshipType: "descended-from",
			}),
		]),

		// MZ + MZH
		createKinshipEdge({
			id: "e-mz-mzh",
			source: "mz",
			sourceHandle: "right",
			target: "mzh",
			targetHandle: "left",
			relationshipType: "married",
		}),

		// M + F
		createKinshipEdge({
			id: "e-m-f",
			source: "m",
			sourceHandle: "right",
			target: "f",
			targetHandle: "left",
			relationshipType: "married",
		}),

		// MB + MBW
		createKinshipEdge({
			id: "e-mb-mbw",
			source: "mb",
			sourceHandle: "right",
			target: "mbw",
			targetHandle: "left",
			relationshipType: "married",
		}),

		// Cousins
		createKinshipEdge({
			id: "e-mz-mzs",
			source: "mz",
			sourceHandle: "bottom",
			target: "mzs",
			targetHandle: "top",
			relationshipType: "descended-from",
		}),

		createKinshipEdge({
			id: "e-mzh-mzs",
			source: "mzh",
			sourceHandle: "bottom",
			target: "mzs",
			targetHandle: "top",
			relationshipType: "descended-from",
		}),

		createKinshipEdge({
			id: "e-mb-mbs",
			source: "mb",
			sourceHandle: "bottom",
			target: "mbs",
			targetHandle: "top",
			relationshipType: "descended-from",
		}),

		createKinshipEdge({
			id: "e-mbw-mbs",
			source: "mbw",
			sourceHandle: "bottom",
			target: "mbs",
			targetHandle: "top",
			relationshipType: "descended-from",
		}),

		// Ego siblings
		...(["ego", "b", "z", "b2"] as const).flatMap((child) => [
			createKinshipEdge({
				id: `e-m-${child}`,
				source: "m",
				sourceHandle: "bottom",
				target: child,
				targetHandle: "top",
				relationshipType: "descended-from",
			}),
			createKinshipEdge({
				id: `e-f-${child}`,
				source: "f",
				sourceHandle: "bottom",
				target: child,
				targetHandle: "top",
				relationshipType: "descended-from",
			}),
		]),
	];

	return buildChartDocumentSnapshot({
		title: "Matrilineal chart",
		createdAt: new Date().toISOString(),
		viewport: DEFAULT_VIEWPORT,
		nodes,
		edges,
	});
}