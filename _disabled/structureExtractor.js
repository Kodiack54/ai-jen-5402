/**
 * Structure Extractor - REGEX pass-through for file structure, schemas, APIs
 * NO AI - pure pattern matching
 * Auto-assigns project based on file paths
 */

const logger = require('../lib/logger');

// Known project path mappings
const PROJECT_PATH_PATTERNS = [
  { pattern: /kodiack-dashboard-5500/i, project: 'kodiack-dashboard' },
  { pattern: /kodiack-studio/i, project: 'kodiack-studio' },
  { pattern: /nextbid-engine/i, project: 'nextbid-engine' },
  { pattern: /nextbid-portal|portal-dev|portal-test/i, project: 'nextbid-portal' },
  { pattern: /nextbid-sources|source-dev|source-test/i, project: 'nextbid-sources' },
  { pattern: /nextbidder/i, project: 'nextbidder' },
  { pattern: /nexttech/i, project: 'nexttech' },
  { pattern: /nexttask/i, project: 'nexttask' },
  { pattern: /ai-chad/i, project: 'ai-chad' },
  { pattern: /ai-jen/i, project: 'ai-jen' },
  { pattern: /ai-susan/i, project: 'ai-susan' },
  { pattern: /ai-clair/i, project: 'ai-clair' },
  { pattern: /ai-team/i, project: 'ai-team' },
  { pattern: /dev-studio/i, project: 'dev-studio' },
];

/**
 * Extract project slug from a file path
 */
function detectProject(path) {
  if (!path) return null;

  for (const { pattern, project } of PROJECT_PATH_PATTERNS) {
    if (pattern.test(path)) {
      return project;
    }
  }

  // Try to extract from path segments
  // C:\Projects\Studio\kodiack-dashboard-5500\src\... -> kodiack-dashboard-5500
  const segments = path.replace(/\\/g, '/').split('/');
  for (const seg of segments) {
    if (seg.includes('-') && !seg.startsWith('.')) {
      return seg.toLowerCase();
    }
  }

  return null;
}

/**
 * Extract file structure from content
 * Looks for file paths, folder trees, etc.
 */
function extractFileStructure(content, sessionPath) {
  const items = [];
  const seenPaths = new Set();

  // Pattern 1: Windows paths - C:\Projects\...\file.ext
  const windowsPathRegex = /[A-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+\.\w+/gi;

  // Pattern 2: Unix paths - /var/www/.../file.ext
  const unixPathRegex = /\/(?:var|home|usr|etc|www)(?:\/[^\/\s:*?"<>|]+)+\.\w+/gi;

  // Pattern 3: Relative paths in code - src/app/page.tsx, ./components/Button.tsx
  const relativePathRegex = /(?:src|app|components|lib|services|routes|api)\/[^\s'"`,;)}\]]+\.\w+/gi;

  const allPaths = [
    ...(content.match(windowsPathRegex) || []),
    ...(content.match(unixPathRegex) || []),
    ...(content.match(relativePathRegex) || []),
  ];

  for (const fullPath of allPaths) {
    const normalized = fullPath.replace(/\\/g, '/').toLowerCase();
    if (seenPaths.has(normalized)) continue;
    seenPaths.add(normalized);

    const project = detectProject(fullPath) || detectProject(sessionPath);
    const fileName = fullPath.split(/[\/\\]/).pop();
    const ext = fileName.split('.').pop()?.toLowerCase();

    // Skip common non-code files
    if (['log', 'tmp', 'cache', 'lock'].includes(ext)) continue;

    items.push({
      bucket: 'File Structure',
      convention_type: 'structure',
      name: fileName,
      description: fullPath,
      project_slug: project,
      keywords: [ext, fileName.replace(/\.\w+$/, '')],
    });
  }

  return items;
}

/**
 * Extract database patterns from content
 * Looks for SQL CREATE TABLE, ALTER TABLE, schema definitions
 */
function extractDatabasePatterns(content, sessionPath) {
  const items = [];
  const seenTables = new Set();

  // CREATE TABLE statements
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(/gi;
  let match;
  while ((match = createTableRegex.exec(content)) !== null) {
    const tableName = match[1];
    if (seenTables.has(tableName.toLowerCase())) continue;
    seenTables.add(tableName.toLowerCase());

    items.push({
      bucket: 'Database Patterns',
      convention_type: 'database',
      name: `Table: ${tableName}`,
      description: match[0].substring(0, 200),
      project_slug: detectProject(sessionPath),
      keywords: ['sql', 'table', tableName],
    });
  }

  // ALTER TABLE statements
  const alterTableRegex = /ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+(?:ADD|DROP|MODIFY|ENABLE|DISABLE)/gi;
  while ((match = alterTableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const key = `alter_${tableName.toLowerCase()}`;
    if (seenTables.has(key)) continue;
    seenTables.add(key);

    items.push({
      bucket: 'Database Patterns',
      convention_type: 'database',
      name: `Schema: ${tableName}`,
      description: match[0].substring(0, 200),
      project_slug: detectProject(sessionPath),
      keywords: ['sql', 'schema', tableName],
    });
  }

  return items;
}

/**
 * Extract API patterns from content
 * Looks for route definitions, endpoint patterns
 */
function extractAPIPatterns(content, sessionPath) {
  const items = [];
  const seenEndpoints = new Set();

  // Express-style routes: app.get('/api/users', ...)
  const expressRouteRegex = /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match;
  while ((match = expressRouteRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    const key = `${method}_${path}`;
    if (seenEndpoints.has(key)) continue;
    seenEndpoints.add(key);

    items.push({
      bucket: 'API Patterns',
      convention_type: 'api',
      name: `${method} ${path}`,
      description: `Express route: ${method} ${path}`,
      project_slug: detectProject(sessionPath),
      keywords: ['api', 'route', method.toLowerCase(), path.split('/').filter(Boolean)[0]],
    });
  }

  // Next.js API routes: /api/...
  const nextApiRegex = /\/api\/[a-z0-9\-_\/\[\]]+/gi;
  const apiPaths = content.match(nextApiRegex) || [];
  for (const path of apiPaths) {
    if (seenEndpoints.has(path)) continue;
    seenEndpoints.add(path);

    items.push({
      bucket: 'API Patterns',
      convention_type: 'api',
      name: path,
      description: `Next.js API route: ${path}`,
      project_slug: detectProject(sessionPath),
      keywords: ['api', 'nextjs', ...path.split('/').filter(Boolean)],
    });
  }

  return items;
}

/**
 * Extract component patterns from content
 * Looks for React components, function definitions
 */
function extractComponentPatterns(content, sessionPath) {
  const items = [];
  const seenComponents = new Set();

  // React function components: function ComponentName() or const ComponentName =
  const funcComponentRegex = /(?:function|const)\s+([A-Z][a-zA-Z0-9]+)\s*(?:=\s*(?:\([^)]*\)|[^=])?\s*=>|\()/g;
  let match;
  while ((match = funcComponentRegex.exec(content)) !== null) {
    const name = match[1];
    if (seenComponents.has(name)) continue;
    if (['Error', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date'].includes(name)) continue;
    seenComponents.add(name);

    items.push({
      bucket: 'Component Patterns',
      convention_type: 'component',
      name: name,
      description: `React component: ${name}`,
      project_slug: detectProject(sessionPath),
      keywords: ['react', 'component', name.toLowerCase()],
    });
  }

  return items;
}

/**
 * Main extraction function - runs all pattern extractors
 * Returns structure items with project assignments
 */
function extract(content, sessionPath) {
  if (!content || content.length < 50) {
    return [];
  }

  const items = [
    ...extractFileStructure(content, sessionPath),
    ...extractDatabasePatterns(content, sessionPath),
    ...extractAPIPatterns(content, sessionPath),
    ...extractComponentPatterns(content, sessionPath),
  ];

  logger.info('Structure extraction complete', {
    total: items.length,
    byBucket: items.reduce((acc, item) => {
      acc[item.bucket] = (acc[item.bucket] || 0) + 1;
      return acc;
    }, {}),
  });

  return items;
}

module.exports = {
  extract,
  detectProject,
  extractFileStructure,
  extractDatabasePatterns,
  extractAPIPatterns,
  extractComponentPatterns,
};
