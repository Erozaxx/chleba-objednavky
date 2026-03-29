#!/usr/bin/env node
// ui-agent.js — Claude API UI agent for GitHub Actions
// Node.js 18+ only, zero npm dependencies

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 8192;
const MAX_FILE_SIZE = 100 * 1024; // 100 KB
const MAX_CONTEXT_FILES = 5;

const SYSTEM_PROMPT = `Jsi UI asistent pro Next.js 14 + Tailwind CSS v3 aplikaci.
Uživatel žádá o vizuální změnu. Odpovídej POUZE jako JSON pole souborů.
Neměň logiku, ne API routes, ne middleware – jen vizuál (komponenty, styly, layouty).
Používej Tailwind CSS v3 syntax (NE v4 direktivy jako @theme).

Formát odpovědi (POUZE tento JSON, nic jiného):
[
  { "path": "relativní/cesta/k/souboru", "content": "celý nový obsah souboru" }
]`;

// ---------------------------------------------------------------------------
// Allowlist / Denylist
// ---------------------------------------------------------------------------
function matchesAllowlist(filePath) {
  const patterns = [
    /^components\/.+/,
    /^app\/(.+\/)?page\.tsx$/,
    /^app\/(.+\/)?layout\.tsx$/,
    /^app\/globals\.css$/,
    /^tailwind\.config\.ts$/,
  ];
  return patterns.some((p) => p.test(filePath));
}

function matchesDenylist(filePath) {
  const patterns = [
    /^middleware\.ts$/,
    /^lib\/db\//,
    /^\.env/,
    /^package\.json$/,
    /^package-lock\.json$/,
    /^next\.config\./,
    /^app\/api\//,
  ];
  return patterns.some((p) => p.test(filePath));
}

// ---------------------------------------------------------------------------
// Context gathering
// ---------------------------------------------------------------------------
function readFileSafe(filePath, repoRoot) {
  const abs = path.resolve(repoRoot, filePath);
  try {
    const stat = fs.statSync(abs);
    if (stat.size > MAX_FILE_SIZE) {
      console.warn(`[WARN] Skipping ${filePath}: exceeds 100 KB (${stat.size} bytes)`);
      return null;
    }
    return fs.readFileSync(abs, "utf-8");
  } catch {
    console.warn(`[WARN] Cannot read ${filePath}, skipping`);
    return null;
  }
}

function extractMentionedFiles(prompt) {
  const regex = /(?:components\/|app\/)[^\s'",)}\]]+/g;
  const matches = prompt.match(regex) || [];
  // Deduplicate
  return [...new Set(matches)];
}

function gatherContext(prompt, repoRoot) {
  const alwaysInclude = ["app/globals.css", "tailwind.config.ts"];
  const dynamicFiles = extractMentionedFiles(prompt);

  let contextFiles = [...alwaysInclude];

  if (dynamicFiles.length > 0) {
    contextFiles.push(...dynamicFiles);
  } else {
    // Default fallback context
    contextFiles.push("app/layout.tsx", "components/customer/OrderForm.tsx");
  }

  // Deduplicate and limit to MAX_CONTEXT_FILES
  contextFiles = [...new Set(contextFiles)].slice(0, MAX_CONTEXT_FILES);

  const result = [];
  for (const fp of contextFiles) {
    const content = readFileSafe(fp, repoRoot);
    if (content !== null) {
      result.push({ path: fp, content });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Build user prompt with file context
// ---------------------------------------------------------------------------
function buildUserPrompt(changePrompt, contextFiles) {
  let msg = `Požadavek na změnu:\n${changePrompt}\n\n`;
  msg += `Kontext – aktuální soubory:\n`;
  for (const f of contextFiles) {
    msg += `\n--- ${f.path} ---\n${f.content}\n`;
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------
async function callClaude(systemPrompt, userPrompt, apiKey) {
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errorText}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------
function extractJson(responseText) {
  // Try parsing the whole text as JSON first
  try {
    return JSON.parse(responseText);
  } catch {
    // Look for JSON in markdown fences
    const fenceMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // fall through
      }
    }
    throw new Error(
      `Failed to parse Claude response as JSON.\nResponse text:\n${responseText.slice(0, 500)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateFile(file) {
  if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
    console.warn(`[WARN] Skipping invalid entry (missing path or content)`);
    return false;
  }

  const fp = file.path;

  if (fp.startsWith("/")) {
    console.warn(`[WARN] Skipping ${fp}: absolute path not allowed`);
    return false;
  }
  if (fp.includes("..")) {
    console.warn(`[WARN] Skipping ${fp}: path traversal not allowed`);
    return false;
  }
  if (file.content.length === 0) {
    console.warn(`[WARN] Skipping ${fp}: empty content`);
    return false;
  }
  if (matchesDenylist(fp)) {
    console.warn(`[WARN] Skipping ${fp}: matches denylist`);
    return false;
  }
  if (!matchesAllowlist(fp)) {
    console.warn(`[WARN] Skipping ${fp}: not in allowlist`);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[ERROR] ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const changePrompt = process.env.CHANGE_PROMPT;
  if (!changePrompt) {
    console.error("[ERROR] CHANGE_PROMPT is not set");
    process.exit(1);
  }

  const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
  console.log(`[INFO] Repo root: ${repoRoot}`);
  console.log(`[INFO] Change prompt: ${changePrompt}`);

  // 1. Gather context files
  const contextFiles = gatherContext(changePrompt, repoRoot);
  console.log(`[INFO] Context files: ${contextFiles.map((f) => f.path).join(", ")}`);

  // 2. Build prompt
  const userPrompt = buildUserPrompt(changePrompt, contextFiles);

  // 3. Call Claude API
  console.log("[INFO] Calling Claude API...");
  let response;
  try {
    response = await callClaude(SYSTEM_PROMPT, userPrompt, apiKey);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  // 4. Extract text from response
  const textBlock = response.content?.find((b) => b.type === "text");
  if (!textBlock) {
    console.error("[ERROR] No text content in Claude response");
    process.exit(1);
  }

  console.log(`[INFO] Claude stop_reason: ${response.stop_reason}`);

  // 5. Parse JSON
  let files;
  try {
    files = extractJson(textBlock.text);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(files)) {
    console.error("[ERROR] Claude response is not a JSON array");
    process.exit(1);
  }

  // 6. Validate and write files
  const written = [];
  for (const file of files) {
    if (!validateFile(file)) continue;

    const absPath = path.resolve(repoRoot, file.path);
    const resolvedRoot = path.resolve(repoRoot) + path.sep;

    // Ensure resolved path is within repo root (prevent symlink escape)
    if (!absPath.startsWith(resolvedRoot)) {
      console.warn(`[WARN] Skipping ${file.path}: resolves outside repo root`);
      continue;
    }

    const dir = path.dirname(absPath);

    // Ensure parent directory exists
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(absPath, file.content, "utf-8");
    written.push(file.path);
    console.log(`[OK] Written: ${file.path}`);
  }

  // 7. Summary
  if (written.length === 0) {
    console.log("[INFO] No valid files to write. Exiting with 0 (no changes).");
    process.exit(0);
  }

  console.log(`\n[SUMMARY] ${written.length} file(s) changed:`);
  for (const fp of written) {
    console.log(`  - ${fp}`);
  }
}

main();
