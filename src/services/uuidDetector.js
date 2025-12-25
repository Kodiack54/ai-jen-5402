/**
 * UUID Detector - Detects client_id, parent_id, project_id from content
 * Looks up UUIDs from dev_clients and dev_projects tables
 */

const db = require('../lib/db');
const { Logger } = require('../lib/logger');

const logger = new Logger('Jen:UUIDDetector');

// Cache for lookups (refreshed every 5 minutes)
let cache = { clients: [], projects: [], expiry: 0 };
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Load clients and projects from DB into cache
 */
async function loadCache() {
  const now = Date.now();
  if (cache.expiry > now) return;

  try {
    const { data: clients } = await db.from('dev_clients')
      .select('id, name, slug');
    
    const { data: projects } = await db.from('dev_projects')
      .select('id, name, slug, client_id, parent_id, is_parent');

    cache = {
      clients: (clients || []).map(c => ({
        id: c.id,
        name: c.name.toLowerCase(),
        slug: (c.slug || '').toLowerCase(),
        keywords: buildKeywords(c.name, c.slug)
      })),
      projects: (projects || []).map(p => ({
        id: p.id,
        name: p.name.toLowerCase(),
        slug: (p.slug || '').toLowerCase(),
        client_id: p.client_id,
        parent_id: p.parent_id,
        is_parent: p.is_parent,
        keywords: buildKeywords(p.name, p.slug)
      })),
      expiry: now + CACHE_TTL
    };

    logger.info('Cache loaded', { 
      clients: cache.clients.length, 
      projects: cache.projects.length 
    });
  } catch (err) {
    logger.error('Failed to load cache', { error: err.message });
  }
}

/**
 * Build searchable keywords from name and slug
 */
function buildKeywords(name, slug) {
  const words = [];
  if (name) {
    words.push(name.toLowerCase());
    words.push(...name.toLowerCase().split(/[\s\-_]+/));
  }
  if (slug) {
    words.push(slug.toLowerCase());
    words.push(...slug.toLowerCase().split(/[\-_]+/));
  }
  return [...new Set(words)].filter(w => w.length > 2);
}

/**
 * Detect UUIDs from content
 * Returns { client_id, parent_id, project_id }
 */
async function detect(content) {
  if (!content) return { client_id: null, parent_id: null, project_id: null };
  
  await loadCache();
  
  const contentLower = content.toLowerCase();
  
  // Score each project
  const projectScores = cache.projects.map(p => {
    let score = 0;
    for (const kw of p.keywords) {
      if (contentLower.includes(kw)) {
        score += kw.length > 5 ? 3 : 1;
      }
    }
    return { ...p, score };
  }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);

  // Score each client
  const clientScores = cache.clients.map(c => {
    let score = 0;
    for (const kw of c.keywords) {
      if (contentLower.includes(kw)) {
        score += kw.length > 5 ? 3 : 1;
      }
    }
    return { ...c, score };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);

  let result = { client_id: null, parent_id: null, project_id: null };

  // Best matching project
  if (projectScores.length > 0) {
    const best = projectScores[0];
    result.project_id = best.id;
    result.client_id = best.client_id;
    result.parent_id = best.parent_id;
    
    logger.debug('Project detected', { 
      name: best.name, 
      score: best.score,
      project_id: best.id
    });
  }

  // If no project but client found, use client
  if (!result.client_id && clientScores.length > 0) {
    result.client_id = clientScores[0].id;
    logger.debug('Client detected', { 
      name: clientScores[0].name,
      client_id: clientScores[0].id
    });
  }

  return result;
}

/**
 * Force refresh cache
 */
async function refresh() {
  cache.expiry = 0;
  await loadCache();
}

module.exports = { detect, refresh, loadCache };
