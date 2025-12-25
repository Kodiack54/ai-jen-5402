/**
 * Content-Based Project Detection (v3.3)
 * Extracts file paths from content and detects actual project
 * v3.3: Added 90% penalty for studios/kodiack-studio/dev-studio slugs
 */

/**
 * Extract file paths from raw content
 */
function extractFilePathsFromContent(content) {
  if (!content) return [];

  const paths = new Set();

  // Windows paths: C:\Projects\NextBid_Portals\...
  const winMatches = content.match(/[A-Z]:\\[^"\s\n\r:*?"<>|]+/gi) || [];

  // Escaped backslash paths from JSON
  const winEscMatches = content.match(/[A-Z]:\\\\[^"\s\n\r]+/gi) || [];

  // Unix paths: /var/www/... or /Projects/...
  const unixMatches = content.match(/\/(?:var\/www|home|Projects)\/[^\s\n\r"']+/gi) || [];

  [...winMatches, ...winEscMatches, ...unixMatches].forEach(p => {
    const normalized = p.replace(/\\\\/g, '/').replace(/\\/g, '/').toLowerCase();
    paths.add(normalized);
  });

  return Array.from(paths);
}

/**
 * Normalize string for matching (remove underscores, hyphens, make lowercase)
 */
function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[-_]/g, '').replace(/s$/, '');
}

/**
 * Detect actual project from content file paths
 */
async function detectProjectFromContentPaths(contentPaths, currentProjectId, db, projectPathCache, logger) {
  if (!contentPaths || contentPaths.length === 0) return null;

  // Try to load project paths table (may not exist)
  let projectPaths = [];
  try {
    const { data } = await db.from('dev_project_paths').select('project_id, path, label');
    projectPaths = data || [];
  } catch (e) {
    // Table doesn't exist, skip
  }

  const { data: projects } = await db.from('dev_projects').select('id, name, slug');

  const scores = {};
  const matchDetails = {};

  for (const extractedPath of contentPaths) {
    const normalizedPath = normalizeForMatch(extractedPath);

    // Check against registered project paths (+10 points)
    for (const pp of projectPaths) {
      const registeredPath = normalizeForMatch(pp.path);
      if (normalizedPath.includes(registeredPath) || registeredPath.includes(normalizedPath)) {
        scores[pp.project_id] = (scores[pp.project_id] || 0) + 10;
        matchDetails[pp.project_id] = matchDetails[pp.project_id] || [];
        matchDetails[pp.project_id].push('path');
      }
    }

    // Check against project slugs (+5 points) - with normalization
    for (const proj of projects || []) {
      const normalizedSlug = normalizeForMatch(proj.slug);
      const normalizedName = normalizeForMatch(proj.name);

      if (normalizedSlug && normalizedSlug.length > 3 && normalizedPath.includes(normalizedSlug)) {
        scores[proj.id] = (scores[proj.id] || 0) + 5;
        matchDetails[proj.id] = matchDetails[proj.id] || [];
        matchDetails[proj.id].push('slug:' + proj.slug);
      }

      // Also check name
      if (normalizedName && normalizedName.length > 5 && normalizedPath.includes(normalizedName)) {
        scores[proj.id] = (scores[proj.id] || 0) + 3;
        matchDetails[proj.id] = matchDetails[proj.id] || [];
        matchDetails[proj.id].push('name:' + proj.name);
      }
    }
  }

  // Penalize studio-related projects by 90% (/var/www/Studio/ is always in paths)
  for (const [projId, score] of Object.entries(scores)) {
    const proj = (projects || []).find(p => p.id === projId);
    if (proj && proj.slug) {
      const slug = proj.slug.toLowerCase();
      // Penalize studios, kodiack-studio, dev-studio (they match folder names not projects)
      if (slug === 'studios' || slug.includes('kodiack') || slug.includes('dev-studio')) {
        scores[projId] = score * 0.1; // 90% penalty
      }
      // Also penalize ai-team projects slightly (we SSH into them a lot)
      else if (slug.startsWith('ai-')) {
        scores[projId] = score * 0.7; // 30% penalty
      }
    }
  }

  // Get highest scoring project
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const [bestProjectId, bestScore] = sorted[0];

  // Require score >= 5 and different from current
  if (bestScore >= 5 && bestProjectId !== currentProjectId) {
    logger.info('Content-based project detected', {
      from: currentProjectId,
      to: bestProjectId,
      score: bestScore,
      matches: matchDetails[bestProjectId],
      pathCount: contentPaths.length
    });
    return bestProjectId;
  }

  return null;
}

module.exports = { extractFilePathsFromContent, detectProjectFromContentPaths };
