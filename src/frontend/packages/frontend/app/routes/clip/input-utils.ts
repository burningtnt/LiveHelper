import { toast } from "sonner";
import type { InputDeclaration, InputValue } from "~/api/schema";

/**
 * Build initial InputValue[] from declarations (all values set to null).
 */
export function buildInputsFromDeclarations(
    declarations: InputDeclaration[],
): InputValue[] {
    return declarations.map((decl) => ({
        id: decl.id,
        type: decl.type,
        value: null,
    }));
}

/**
 * Validate and normalize values before sending to parent.
 * - Validates all non-multivalue declarations have a non-null value (aborts with toast if not)
 * - For each multivalue declaration: re-index IDs, calculate count, insert count value
 * - Ensures every InputValue carries the correct `type` matching its declaration
 * Returns the normalized array, or `null` if validation failed.
 */
export function validateAndNormalize(
    raw: InputValue[],
    declarations: InputDeclaration[],
): InputValue[] | null {
    function findIndexedValues(
        values: InputValue[],
        baseId: string,
    ): InputValue[] {
        const prefix = `${baseId}.`;
        return values
            .filter((v) => v.id.startsWith(prefix))
            .sort((a, b) => {
                const ai = Number(a.id.slice(prefix.length));
                const bi = Number(b.id.slice(prefix.length));
                return ai - bi;
            });
    }

    const result: InputValue[] = [];

    for (const decl of declarations) {
        if (decl.multivalue) {
            // Collect indexed values, re-index consecutively
            const indexed = findIndexedValues(raw, decl.id);
            for (const inner of indexed) {
                if (inner.type !== decl.type || inner.value === null) {
                    const typeHint =
                        decl.type === "pose"
                            ? "坐标和视角，必须填写"
                            : "数字";
                    toast.warning(`${decl.name} 的输入类型为${typeHint}`);
                    return null;
                }
            }
            const reindexed = indexed.map((iv, i) => ({
                ...iv,
                id: `${decl.id}.${i}`,
            }));
            // Insert count value
            result.push({
                id: decl.id,
                type: "number" as const,
                value: reindexed.length,
            });
            result.push(...reindexed);
        } else {
            const match = raw.find((v) => v.id === decl.id);
            if (!match || match.value === null) {
                const typeHint =
                    decl.type === "pose" ? "坐标和视角，必须填写" : "数字";
                toast.warning(`${decl.name} 的输入类型为${typeHint}`);
                return null;
            }
            result.push({ ...match, type: decl.type });
        }
    }

    return result;
}
