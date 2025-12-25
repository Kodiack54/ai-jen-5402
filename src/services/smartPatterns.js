/**
 * Smart Patterns v3.0 - STRUCTURE Item Detection
 *
 * This module handles LITERAL pass-through of structured content:
 * - Database schemas (CREATE TABLE, columns)
 * - File structure trees (directory listings)
 * - Code blocks (```language...```)
 * - API patterns (routes, endpoints)
 *
 * These don't need AI synthesis - just detect and pass through.
 * Project ID comes from session path.
 */

const { Logger } = require("../lib/logger");
const logger = new Logger("Jen:SmartPatterns");

/**
 * Extract STRUCTURE items from messages
 * Returns literal content - no synthesis needed
 */
function extract(messages, sessionCwd) {
  const items = [];
  const fullText = messages.map(m => m.content || "").join("\n\n");
  const seen = new Set();

  // Helper to add item with deduplication
  const addItem = (bucket, title, content, confidence = 0.9) => {
    // Dedupe by content hash
    const key = bucket + ":" + content.substring(0, 100).replace(/\s/g, '');
    if (seen.has(key)) return;
    if (content.length < 20) return; // Too short

    seen.add(key);
    items.push({
      bucket,
      title: title.substring(0, 100),
      content: content.substring(0, 2000),
      confidence,
      source: "pattern",
      isStructure: true
    });
  };

  // ============ DATABASE PATTERNS ============
  // CREATE TABLE statements
  const createTables = fullText.match(/CREATE\s+TABLE\s+[\w"`\[\]]+\s*\([^;]+\);?/gi) || [];
  createTables.forEach(sql => {
    const tableName = sql.match(/CREATE\s+TABLE\s+["`\[\]]?([\w]+)/i)?.[1] || 'table';
    addItem("Database Patterns", `Schema: ${tableName}`, sql.trim(), 0.95);
  });

  // ALTER TABLE statements
  const alterTables = fullText.match(/ALTER\s+TABLE\s+[\w"`\[\]]+\s+(?:ADD|DROP|MODIFY|ALTER)[^;]+;?/gi) || [];
  alterTables.forEach(sql => {
    const tableName = sql.match(/ALTER\s+TABLE\s+["`\[\]]?([\w]+)/i)?.[1] || 'table';
    addItem("Database Patterns", `Alter: ${tableName}`, sql.trim(), 0.9);
  });

  // RLS policies
  const policies = fullText.match(/CREATE\s+POLICY\s+[\w"`]+[^;]+;?/gi) || [];
  policies.forEach(sql => {
    addItem("Database Patterns", "RLS Policy", sql.trim(), 0.9);
  });

  // ============ FILE STRUCTURE ============
  // Directory tree listings (indented with ├── or └── or spaces)
  const treeListing = fullText.match(/(?:^|\n)[\s│]*[├└─┬]\s*[\w\-\.\/]+(?:\n[\s│]*[├└─┬│\s]*[\w\-\.\/]+)*/gm) || [];
  treeListing.forEach(tree => {
    if (tree.split('\n').length >= 3) { // At least 3 lines
      addItem("File Structure", "Directory Tree", tree.trim(), 0.9);
    }
  });

  // Folder structure descriptions
  const folderDesc = fullText.match(/(?:^|\n)(?:src|app|lib|components|pages|api)\/[\w\-\/]+(?:\n\s*[-*]\s*[\w\-\/\.]+)*/gm) || [];
  folderDesc.forEach(desc => {
    if (desc.split('\n').length >= 2) {
      addItem("File Structure", "Folder Layout", desc.trim(), 0.85);
    }
  });

  // ============ API PATTERNS ============
  // Express/Next.js route definitions
  const routes = fullText.match(/(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]/gi) || [];
  routes.forEach(route => {
    addItem("API Patterns", "Route Definition", route.trim(), 0.9);
  });

  // API endpoint paths with methods
  const endpoints = fullText.match(/(?:GET|POST|PUT|PATCH|DELETE)\s+\/[\w\-\/\:]+/gi) || [];
  endpoints.forEach(ep => {
    addItem("API Patterns", "Endpoint", ep.trim(), 0.85);
  });

  // OpenAPI/Swagger paths
  const swaggerPaths = fullText.match(/['"`]\/[\w\-\/\{\}:]+['"`]\s*:\s*\{[^}]+\}/gi) || [];
  swaggerPaths.forEach(path => {
    addItem("API Patterns", "API Path", path.trim(), 0.85);
  });

  // ============ COMPONENT PATTERNS ============
  // React component exports
  const components = fullText.match(/export\s+(?:default\s+)?(?:function|const)\s+[\w]+\s*(?:\([^)]*\)|=)/gi) || [];
  components.forEach(comp => {
    const name = comp.match(/(?:function|const)\s+([\w]+)/)?.[1];
    if (name && name[0] === name[0].toUpperCase()) { // PascalCase = component
      addItem("Component Patterns", `Component: ${name}`, comp.trim(), 0.85);
    }
  });

  // ============ SNIPPETS ============
  // Code blocks with language tag
  const codeBlocks = fullText.match(/```(?:js|javascript|ts|typescript|jsx|tsx|sql|python|bash|sh|css|json)[\s\S]*?```/gi) || [];
  codeBlocks.forEach(block => {
    const lang = block.match(/```(\w+)/)?.[1] || 'code';
    const code = block.replace(/```\w*\n?/, '').replace(/```$/, '').trim();
    if (code.length > 30 && code.split('\n').length >= 2) {
      addItem("Snippets", `${lang} snippet`, code, 0.9);
    }
  });

  // ============ NAMING CONVENTIONS ============
  // Explicit naming patterns
  const namingPatterns = fullText.match(/(?:named?|naming|convention|pattern)\s*(?:is|are|:)\s*[^\n]+/gi) || [];
  namingPatterns.forEach(pattern => {
    addItem("Naming Conventions", "Naming Pattern", pattern.trim(), 0.85);
  });

  // File naming patterns
  const fileNaming = fullText.match(/(?:files?\s+(?:are|should be)\s+named|\.(?:tsx?|jsx?|css|json)\s+files?\s+(?:are|use))[^\n]+/gi) || [];
  fileNaming.forEach(pattern => {
    addItem("Naming Conventions", "File Naming", pattern.trim(), 0.85);
  });

  // ============ SCHEMATIC ============
  // ASCII flow diagrams
  const flowDiagrams = fullText.match(/(?:^|\n)[^\n]*(?:→|->|=>|──>|---).*(?:\n[^\n]*(?:→|->|=>|│|\|)[^\n]*)+/gm) || [];
  flowDiagrams.forEach(diagram => {
    if (diagram.split('\n').length >= 2) {
      addItem("Schematic", "Flow Diagram", diagram.trim(), 0.9);
    }
  });

  // Box diagrams
  const boxDiagrams = fullText.match(/(?:^|\n)\s*[┌╔┏][─═━]+[┐╗┓](?:\n[^\n]+)+\n\s*[└╚┗][─═━]+[┘╝┛]/gm) || [];
  boxDiagrams.forEach(diagram => {
    addItem("Schematic", "Box Diagram", diagram.trim(), 0.9);
  });

  // Log results
  const counts = {};
  items.forEach(i => counts[i.bucket] = (counts[i.bucket] || 0) + 1);
  logger.info("Structure extraction complete", { itemCount: items.length, counts });

  return { items, counts, isStructureOnly: true };
}

/**
 * Check if content has substantial structure items
 * Used to decide if we need AI extraction too
 */
function hasStructureContent(messages) {
  const fullText = messages.map(m => m.content || "").join("\n");

  // Check for code blocks
  if (/```\w+[\s\S]*?```/.test(fullText)) return true;

  // Check for SQL
  if (/CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+POLICY/i.test(fullText)) return true;

  // Check for tree structure
  if (/[├└─┬│]/.test(fullText)) return true;

  return false;
}

module.exports = { extract, hasStructureContent };
