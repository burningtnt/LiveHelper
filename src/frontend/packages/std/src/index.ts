import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { compileWithIncludes } from "@livehelper/compiler";
import type { Program } from "@livehelper/schema";

// ─── Shared types ─────────────────────────────────────────────

type ProgramLike = Omit<Program, "id" | "usage">;

// ─── Section parsing ───────────────────────────────────────────

const SECTION_DELIMITER = /^\/\/ === (.+) ===$/;

function parseSections(content: string): Map<string, string> {
  const lines = content.split("\n");
  const delimiters: { id: string; lineIndex: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_DELIMITER);
    if (!match) continue;

    const sectionId = match[1];

    // Validate: section ID must not contain '='
    if (sectionId.includes("=")) {
      throw new Error(
        `Line ${i + 1}: Invalid section ID "${sectionId}" (contains "=")`,
      );
    }

    // Validate blank line before (unless it's the first line)
    if (i > 0 && lines[i - 1].trim() !== "") {
      throw new Error(
        `Line ${i + 1}: Missing blank line before section delimiter "// === ${sectionId} ==="`,
      );
    }

    // Validate blank line after
    if (i + 1 >= lines.length || lines[i + 1].trim() !== "") {
      throw new Error(
        `Line ${i + 1}: Missing blank line after section delimiter "// === ${sectionId} ==="`,
      );
    }

    delimiters.push({ id: sectionId, lineIndex: i });
  }

  if (delimiters.length === 0) {
    throw new Error("No section delimiters found in file");
  }

  const sections = new Map<string, string>();

  for (let d = 0; d < delimiters.length; d++) {
    const contentStart = delimiters[d].lineIndex + 2; // skip delimiter line and blank line after it

    let sectionLines: string[];
    if (d + 1 < delimiters.length) {
      // End before the blank line preceding the next delimiter
      const contentEnd = delimiters[d + 1].lineIndex - 1;
      sectionLines = lines.slice(contentStart, contentEnd);
    } else {
      // Last section: slice to end, then trim trailing empty lines
      sectionLines = lines.slice(contentStart);
      while (
        sectionLines.length > 0 &&
        sectionLines[sectionLines.length - 1] === ""
      ) {
        sectionLines.pop();
      }
    }

    sections.set(delimiters[d].id, sectionLines.join("\n"));
  }

  return sections;
}

// ─── Runtime validation ────────────────────────────────────────

const VALID_INPUT_TYPES = ["number", "pose"] as const;

function validateProgramLike(data: unknown): asserts data is ProgramLike {
  if (typeof data !== "object" || data === null) {
    throw new Error("meta section content must be a JSON object");
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name === "") {
    throw new Error("meta.name must be a non-empty string");
  }
  if (typeof obj.description !== "string") {
    throw new Error("meta.description must be a string");
  }
  if (!Array.isArray(obj.inputs)) {
    throw new Error("meta.inputs must be an array");
  }

  for (let i = 0; i < obj.inputs.length; i++) {
    const input = obj.inputs[i] as Record<string, unknown>;
    if (typeof input.id !== "string" || input.id === "") {
      throw new Error(`meta.inputs[${i}].id must be a non-empty string`);
    }
    if (typeof input.name !== "string") {
      throw new Error(`meta.inputs[${i}].name must be a string`);
    }
    if (typeof input.description !== "string") {
      throw new Error(`meta.inputs[${i}].description must be a string`);
    }
    if (typeof input.multivalue !== "boolean") {
      throw new Error(`meta.inputs[${i}].multivalue must be a boolean`);
    }
    if (!VALID_INPUT_TYPES.includes(input.type as any)) {
      throw new Error(`meta.inputs[${i}].type must be "number" or "pose"`);
    }
  }
}

// ─── ID generation ─────────────────────────────────────────────

function generateId(content: string, usedIds: Set<number>): number {
  const hashHex = createHash("sha1").update(content, "utf-8").digest("hex");
  const hashBigInt = BigInt("0x" + hashHex);
  const range = BigInt(65536 - 32768 + 1); // 32769
  const baseId = Number(hashBigInt % range) + 32768;

  let id = baseId;
  while (usedIds.has(id)) {
    console.warn(`Warning: ID ${id} already in use, incrementing`);
    id++;
    if (id > 65536) {
      id = 32768;
    }
    if (id === baseId) {
      throw new Error("Ran out of unique IDs in range [32768, 65536]");
    }
  }

  usedIds.add(id);
  return id;
}

// ─── Main ──────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LIBRARIES_DIR = resolve(__dirname, "../libraries");
const BUILD_DIR = resolve(__dirname, "../build");

async function main(): Promise<void> {
  const usageDirs: { dir: string; usage: "clip" | "manager" }[] = [
    { dir: resolve(LIBRARIES_DIR, "clip"), usage: "clip" },
    { dir: resolve(LIBRARIES_DIR, "managers"), usage: "manager" },
  ];

  const usedIds = new Set<number>();
  const writtenFiles: string[] = [];

  for (const { dir, usage } of usageDirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      console.warn(`Warning: Directory "${dir}" does not exist, skipping`);
      continue;
    }

    const tsFiles = entries
      .filter((f) => f.endsWith(".ts"))
      .map((f) => resolve(dir, f))
      .filter((f) => statSync(f).isFile());

    for (const filePath of tsFiles) {
      const fileName = basename(filePath);
      console.log(`Processing ${usage}: ${fileName}`);

      try {
        const content = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");

        // Parse sections
        const sections = parseSections(content);

        // Check required sections
        if (!sections.has("meta")) {
          throw new Error(`File "${fileName}" is missing "meta" section`);
        }
        if (!sections.has("script")) {
          throw new Error(`File "${fileName}" is missing "script" section`);
        }

        // Parse and validate meta JSON
        const metaRaw = JSON.parse(sections.get("meta")!);
        validateProgramLike(metaRaw);

        // Generate ID
        const id = generateId(content, usedIds);

        // Build full Program object
        const program: Program = {
          ...metaRaw,
          usage,
          id,
        };

        // Get script content
        const scriptContent = sections.get("script")!;

        // Compile script via AssemblyScript
        console.log(`  Compiling ${fileName}...`);
        const { binary, error } = await compileWithIncludes(
          scriptContent,
          usage,
        );

        if (error) {
          console.error(`  Compilation failed for ${fileName}: ${error}`);
          process.exit(1);
        }

        // Create output directories
        const programsDir = resolve(BUILD_DIR, "storage.programs");
        const scriptsDir = resolve(BUILD_DIR, "storage.program-scripts");
        const binariesDir = resolve(BUILD_DIR, "storage.program-binaries");
        mkdirSync(programsDir, { recursive: true });
        mkdirSync(scriptsDir, { recursive: true });
        mkdirSync(binariesDir, { recursive: true });

        // Write program JSON (pretty-printed)
        writeFileSync(
          resolve(programsDir, `${id}.json`),
          JSON.stringify(program, null, 2),
          "utf-8",
        );
        writtenFiles.push(`storage.programs/${id}.json`);

        // Write script text (raw)
        writeFileSync(
          resolve(scriptsDir, `${id}.text`),
          scriptContent,
          "utf-8",
        );
        writtenFiles.push(`storage.program-scripts/${id}.text`);

        // Write compiled wasm binary
        if (binary) {
          writeFileSync(
            resolve(binariesDir, `${id}.wasm`),
            Buffer.from(binary),
          );
          writtenFiles.push(`storage.program-binaries/${id}.wasm`);
        }

        console.log(
          `  ✓ ${fileName} → id=${id}, script=${scriptContent.length} chars, binary=${binary?.byteLength ?? 0} bytes`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error processing ${fileName}: ${message}`);
        process.exit(1);
      }
    }
  }

  // Write index file with all written paths
  writeFileSync(
    resolve(BUILD_DIR, "index.json"),
    JSON.stringify(writtenFiles, null, 2),
    "utf-8",
  );

  console.log("\nDone! All scripts processed successfully.");
}

main();
