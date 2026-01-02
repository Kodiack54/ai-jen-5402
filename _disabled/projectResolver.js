/**
 * Project Resolver - resolves NULL project_ids from item descriptions
 */
const db = require('../lib/db');
const { Logger } = require('../lib/logger');
const logger = new Logger('Jen:ProjectResolver');

let projectCache = {};

async function loadCache() {
  const { data: projects } = await db.from('dev_projects')
    .select('id, name, slug, parent_id, client_id, is_parent');
  
  projectCache = {};
  for (const p of projects || []) {
    if (p.is_parent) continue;
    const slug = (p.slug || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    if (slug) projectCache[slug] = p;
    if (name) projectCache[name] = p;
    const noPort = slug.replace(/-\d{4}$/, '');
    if (noPort !== slug) projectCache[noPort] = p;
  }
  return Object.keys(projectCache).length;
}

async function resolve(batchSize = 100) {
  if (Object.keys(projectCache).length === 0) {
    await loadCache();
  }
  
  let resolved = 0;
  
  const { data: items } = await db.from('dev_ai_conventions')
    .select('id, description, name')
    .is('project_id', null)
    .limit(batchSize);
  
  if (!items || items.length === 0) {
    return { resolved: 0, remaining: 0 };
  }
  
  logger.info('Resolving unknown projects', { count: items.length });
  
  for (const item of items) {
    const desc = item.description || item.name || '';
    const pathLower = desc.toLowerCase().replace(/\\/g, "/");
    const parts = pathLower.split("/");
    
    let found = null;
    const skip = ['src', 'lib', 'routes', 'services', 'components', 'app', 'api', 
                  'node_modules', 'var', 'www', 'studio', 'ai-team', 'kodiack_studio', 
                  'kodiack-studio', 'nextbid', 'shared'];
    
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (skip.includes(part)) continue;
      
      if (projectCache[part]) {
        found = projectCache[part];
        break;
      }
      
      const noPort = part.replace(/-\d{4}$/, '');
      if (noPort !== part && projectCache[noPort]) {
        found = projectCache[noPort];
        break;
      }
    }
    
    if (found) {
      await db.from('dev_ai_conventions')
        .update({
          project_id: found.id,
          client_id: found.client_id,
          parent_id: found.parent_id
        })
        .eq('id', item.id);
      resolved++;
    }
  }
  
  const { data: remaining } = await db.from('dev_ai_conventions')
    .select('id')
    .is('project_id', null);
  
  logger.info('Resolved', { resolved, remaining: remaining?.length || 0 });
  return { resolved, remaining: remaining?.length || 0 };
}

module.exports = { loadCache, resolve };
