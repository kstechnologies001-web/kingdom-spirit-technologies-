#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import worker from "./_worker.js";
import { serviceHeaders } from "./server-supabase.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IGNORE_DIRS = new Set([".git", ".wrangler", "node_modules"]);
const failures = [];
const warnings = [];
let checks = 0;
const pass = (message) => { checks++; console.log(`PASS  ${message}`); };
const fail = (message) => { failures.push(message); console.error(`FAIL  ${message}`); };
const warn = (message) => { warnings.push(message); console.warn(`WARN  ${message}`); };

function walk(dir = ROOT, relative = "") {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;
    const rel = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) results.push(...walk(path.join(dir, entry.name), rel));
    else results.push(rel);
  }
  return results;
}

const files = walk();
const fileSet = new Set(files.map((file) => file.replaceAll("\\", "/")));
const rootFiles = fs.readdirSync(ROOT, { withFileTypes: true });
const nestedDeployFiles = files.filter((file) => file.includes("/"));
if (nestedDeployFiles.length) {
  // Documentation may be added later, but executable/public site files must remain in root.
  const allowedNested = nestedDeployFiles.filter((file) => !/^(?:\.git|\.wrangler|node_modules)\//.test(file));
  if (allowedNested.length) fail(`Files are nested below root: ${allowedNested.slice(0, 12).join(", ")}`);
} else pass("All project files are in the repository root (no nested folders)");

for (const required of ["index.html", "_worker.js", "_redirects", "_headers", "wrangler.toml", "package.json", "config.js", "SUPABASE-SETUP.sql"]) {
  if (!fileSet.has(required)) fail(`Required root file is missing: ${required}`);
  else pass(`Required file exists: ${required}`);
}

const jsFiles = files.filter((file) => /\.(?:js|mjs)$/.test(file));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
  if (result.status !== 0) fail(`JavaScript syntax error in ${file}: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  else pass(`JavaScript syntax: ${file}`);
}

function decodePathname(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}
function localTarget(fromFile, rawTarget) {
  const clean = rawTarget.trim().replaceAll("&amp;", "&");
  if (!clean || /^(?:#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean)) return null;
  const withoutQuery = clean.split(/[?#]/, 1)[0];
  if (!withoutQuery) return { file: fromFile, fragment: clean.includes("#") ? clean.split("#").slice(1).join("#") : "" };
  const decoded = decodePathname(withoutQuery);
  const base = decoded.startsWith("/") ? decoded.slice(1) : path.posix.join(path.posix.dirname(fromFile), decoded);
  let normalized = path.posix.normalize(base);
  if (normalized === "." || normalized.endsWith("/")) normalized = `${normalized.replace(/\/$/, "")}/index.html`.replace(/^\//, "");
  const fragment = clean.includes("#") ? clean.split("#").slice(1).join("#") : "";
  return { file: normalized.replace(/^\.\//, ""), fragment };
}

const htmlFiles = files.filter((file) => file.endsWith(".html"));
const htmlText = new Map(htmlFiles.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));
const idsByFile = new Map();
let duplicateIdCount = 0;
for (const [file, text] of htmlText) {
  const ids = new Set();
  const seenIds = new Set();
  for (const match of text.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)) {
    const id = match[2];
    if (seenIds.has(id)) {
      duplicateIdCount++;
      fail(`${file} contains duplicate id=\"${id}\"`);
    }
    seenIds.add(id);
    ids.add(id);
  }
  for (const match of text.matchAll(/\bname\s*=\s*(["'])(.*?)\1/gi)) ids.add(match[2]);
  idsByFile.set(file, ids);
}
if (!duplicateIdCount) pass(`No duplicate HTML id attributes across ${htmlFiles.length} pages`);

const attrPattern = /\b(?:href|src|action|poster)\s*=\s*(["'])(.*?)\1/gi;
for (const [file, text] of htmlText) {
  for (const match of text.matchAll(attrPattern)) {
    const raw = match[2].trim();
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(raw) || raw === "") continue;
    const target = localTarget(file, raw);
    if (!target) continue;
    if (!fileSet.has(target.file)) {
      fail(`${file} points to missing local file: ${raw}`);
      continue;
    }
    if (target.fragment && htmlText.has(target.file)) {
      const ids = idsByFile.get(target.file);
      const fragment = decodePathname(target.fragment);
      const mappedFragment = target.file === "client-dashboard.html" ? `section-${fragment}` : fragment;
      const specialDynamic = file === "login.html" && target.file === "login.html" && fragment === "forgot";
      if (!ids.has(fragment) && !ids.has(mappedFragment) && !specialDynamic) {
        warn(`${file} links to #${fragment} in ${target.file}; target may be handled dynamically`);
      }
    }
  }
}
pass(`Scanned local HTML references in ${htmlFiles.length} HTML pages`);

// Scan CSS url() resources (remote fonts/URLs are intentionally skipped).
for (const file of files.filter((item) => item.endsWith(".css"))) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const match of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    const raw = match[2].trim();
    if (!raw || /^(?:data:|https?:|\/\/|#)/i.test(raw)) continue;
    const target = localTarget(file, raw);
    if (target && !fileSet.has(target.file)) fail(`${file} references missing CSS asset: ${raw}`);
  }
}
pass("Scanned local CSS url() assets");

// Check local JavaScript module imports.
for (const file of jsFiles) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const importPattern = /(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/g;
  for (const match of text.matchAll(importPattern)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    if (!fileSet.has(target)) fail(`${file} imports missing local module: ${match[1]}`);
  }
}
pass(`Scanned local JavaScript module imports in ${jsFiles.length} scripts`);

// Validate explicit redirect targets. Wildcards and external redirect targets are excluded.
if (fileSet.has("_redirects")) {
  const redirectLines = fs.readFileSync(path.join(ROOT, "_redirects"), "utf8").split(/\r?\n/);
  for (const line of redirectLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [source, destination] = trimmed.split(/\s+/);
    if (!destination || destination.includes(":") || destination.includes(":splat") || destination.startsWith("/:") || destination.includes("*") || destination.includes("?")) continue;
    if (/\.[a-z0-9]+$/i.test(destination)) {
      const target = destination.replace(/^\//, "");
      if (!fileSet.has(target)) fail(`Redirect target does not exist: ${source} -> ${destination}`);
    }
  }
  pass("Checked explicit _redirects file targets");
}

// Check sitemap syntax, duplicate paths and local target pages.
if (fileSet.has("sitemap.xml")) {
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
  const seen = new Set();
  for (const location of locations) {
    let url;
    try { url = new URL(location); } catch { fail(`Invalid sitemap URL: ${location}`); continue; }
    const key = `${url.pathname}${url.search}`;
    if (seen.has(key)) fail(`Duplicate sitemap path: ${key}`);
    seen.add(key);
    const target = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    if (!fileSet.has(target)) fail(`Sitemap URL points to missing page: ${location}`);
  }
  if (!locations.length) fail("Sitemap contains no URLs");
  else pass(`Sitemap contains ${locations.length} unique URLs with local pages present`);
}

// Ensure the current config uses new-project placeholders, and known old values are gone.
const config = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
if (!config.includes("YOUR_SUPABASE_PROJECT_REF") || !config.includes("YOUR_SUPABASE_PUBLISHABLE_KEY")) {
  fail("config.js must retain the two clearly marked Supabase placeholders");
} else pass("Browser Supabase URL/key use new-project placeholders");
const allText = files.filter((file) => file !== "check-site.mjs" && /\.(?:html|js|mjs|md|txt|sql|toml|json|xml|ya?ml)$/.test(file))
  .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");
for (const forbidden of ["olegqtbbnztkwdacxhbu", "sb_publishable_F1NUQvDPRTcqYdDeayO7w_FqxMYBl6"]) {
  if (allText.includes(forbidden)) fail(`Old Supabase credential/project identifier still present: ${forbidden}`);
}
if (!allText.includes("/api/health")) fail("The /api/health route is not documented or implemented");
else pass("Old Supabase project values absent; health route is documented/implemented");

// Exercise the actual Pages Worker router without external services.
try {
  const fakeEnv = { ASSETS: { fetch: async (request) => new Response(`asset:${new URL(request.url).pathname}`) } };
  const ctx = { waitUntil: () => {} };
  const get = (url) => worker.fetch(new Request(url), fakeEnv, ctx);

  let response = await get("https://kst-test.pages.dev/api/health");
  const health = await response.json();
  if (response.status !== 200 || health.ok !== true || !health.readiness || health.readiness.supabase !== false) {
    fail("Worker GET /api/health smoke test failed");
  } else pass("Worker GET /api/health returns a safe readiness response");

  response = await get("https://kst-test.pages.dev/api/chat");
  if (response.status !== 405 || response.headers.get("allow") !== "POST") fail("Worker rejects incorrect API methods");
  else pass("Worker rejects incorrect API methods with 405");

  response = await get("https://kst-test.pages.dev/api/not-a-route");
  if (response.status !== 404) fail("Worker returns 404 for unknown API routes");
  else pass("Worker returns 404 for unknown API routes");

  response = await get("https://kst-test.pages.dev/home.html?from=legacy");
  if (response.status !== 301 || new URL(response.headers.get("location")).pathname !== "/index.html") fail("Worker canonical homepage redirect failed");
  else pass("Worker redirects /home.html to /index.html");

  response = await get("https://kst-test.pages.dev/account/reset-password.html");
  if (response.status !== 301 || new URL(response.headers.get("location")).pathname !== "/reset-password.html") fail("Worker password-reset compatibility redirect failed");
  else pass("Worker redirects legacy password-reset URL to existing page");

  response = await get("https://kst-test.pages.dev/register?source=old-link");
  const registerLocation = new URL(response.headers.get("location"));
  if (response.status !== 302 || registerLocation.pathname !== "/login.html" || registerLocation.searchParams.get("view") !== "register" || registerLocation.searchParams.get("source") !== "old-link") fail("Worker registration shortcut redirect failed");
  else pass("Worker registration shortcut preserves query parameters");

  response = await get("https://kst-test.pages.dev/index.html");
  if (response.status !== 200 || (await response.text()) !== "asset:/index.html") fail("Worker static asset pass-through failed");
  else pass("Worker forwards static page requests to ASSETS");

  const headers = serviceHeaders({ SUPABASE_SECRET_KEY: "sb_secret_test_only" });
  if (headers.apikey !== "sb_secret_test_only" || Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    fail("Supabase secret-key headers must use apikey without Authorization Bearer");
  } else pass("Supabase sb_secret_* is sent only in the apikey header");
} catch (error) {
  fail(`Worker smoke test threw unexpectedly: ${error.message}`);
}

console.log("\n--- KST site check summary ---");
console.log(`${checks} checks passed, ${warnings.length} warning(s), ${failures.length} failure(s).`);
if (warnings.length) {
  console.log("Warnings are listed above and should be manually checked where applicable.");
}
if (failures.length) process.exitCode = 1;
else console.log("No blocking static-check failures found.");
