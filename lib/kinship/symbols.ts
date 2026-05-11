import {
  KINSHIP_NODE_TYPE,
  KINSHIP_TEXT_NODE_TYPE,
  type KinshipNode,
  type KinshipSymbolNode,
  type KinshipSymbolType,
  type KinshipTextNode,
} from "@/lib/kinship/types";

export type KinshipGender = "female" | "male";

export function isMaleSymbolType(symbolType: KinshipSymbolType) {
  return (
    symbolType === "male" ||
    symbolType === "deceased-male" ||
    symbolType === "male-ego" ||
    symbolType === "adopted-male"
  );
}

export function isFemaleSymbolType(symbolType: KinshipSymbolType) {
  return !isMaleSymbolType(symbolType);
}

export function getKinshipGender(symbolType: KinshipSymbolType): KinshipGender {
  return isMaleSymbolType(symbolType) ? "male" : "female";
}

export function isEgoSymbolType(symbolType: KinshipSymbolType) {
  return symbolType === "female-ego" || symbolType === "male-ego";
}

/* ---------------------------------------------------------------------------
 * Node-kind guards
 * -------------------------------------------------------------------------*/

export function isSymbolNode(node: KinshipNode): node is KinshipSymbolNode {
  return node.type === KINSHIP_NODE_TYPE;
}

export function isTextNode(node: KinshipNode): node is KinshipTextNode {
  return node.type === KINSHIP_TEXT_NODE_TYPE;
}

/** Filter helper: keep only the person/symbol nodes (drop text annotations). */
export function filterSymbolNodes(nodes: KinshipNode[]): KinshipSymbolNode[] {
  return nodes.filter(isSymbolNode);
}
