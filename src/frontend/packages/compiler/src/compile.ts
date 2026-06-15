import commonInclude from "./include/common.js";
import clipInclude from "./include/clip.js";
import managerInclude from "./include/manager.js";

/**
 * Compile AssemblyScript code with modular include files.
 *
 * - Passes `include/common.ts`, `include/clip.ts` or `include/manager.ts` as
 *   separate virtual files so the user code can import from them directly.
 * - The include files are not shown in the editor or sent to the backend.
 */
export async function compileWithIncludes(
  code: string,
  usage: "clip" | "manager",
): Promise<{
  binary: Uint8Array | null;
  error: string | null;
}> {
  const sources: Record<string, string> = {
    "include/common.ts": commonInclude,
    "user-code.ts": code,
  };
  if (usage === "clip") {
    sources["include/clip.ts"] = clipInclude;
  } else {
    sources["include/manager.ts"] = managerInclude;
  }

  const asc = (await import("assemblyscript/asc")).default;
  const result = await asc.compileString(sources, {
    optimizeLevel: 2,
    runtime: "incremental",
    debug: true,
  });

  if (result.error || !result.binary) {
    const errMsg = result.stderr.toString() || result.error?.message || "编译失败";
    return { binary: null, error: errMsg };
  }

  return { binary: result.binary, error: null };
}
