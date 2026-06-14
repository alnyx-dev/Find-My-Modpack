const ModrinthClient = require('./modrinth/client');
const ModpackDB = require('./db');
const { buildFacets, buildBroadFacets } = require('./modrinth/facets');
const { SEARCH_PROMPT, RANK_PROMPT } = require('./prompts');

const VALID_SORT_OPTIONS = ['relevance', 'downloads', 'follows', 'newest', 'updated'];
const CACHE_TTL = 3600000;
const MIN_RESULTS_FOR_RANKING = 5;
const MAX_FIELD_LENGTH = 300;

function truncate(str, max = MAX_FIELD_LENGTH) {
  if (!str || typeof str !== 'string') return '';
  return str.length > max ? str.substring(0, max) + '...' : str;
}

function fillTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (t, [key, val]) => t.replaceAll(`{${key}}`, val),
    template
  );
}

function parseJsonFromAI(text) {
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);
}

class Orchestrator {
  constructor(providerManager) {
    this.providerManager = providerManager;
    this.modrinth = new ModrinthClient();
    this.db = null;
    this.cache = {
      loaders: null,
      versions: null,
      categories: null,
      lastFetched: 0
    };

    try {
      this.db = new ModpackDB().init();
      const count = this.db.getCount();
      console.log(`[ORCH] Local DB loaded: ${count} modpacks`);
    } catch (e) {
      console.warn('[ORCH] Could not load local DB:', e.message);
      console.warn('[ORCH] Will use API-only search. Run "npm run crawl" to populate the database.');
    }
  }

  async getTags() {
    const now = Date.now();
    if (now - this.cache.lastFetched < CACHE_TTL && this.cache.loaders) {
      console.log('[ORCH] getTags() - using cached tags');
      return {
        loaders: this.cache.loaders,
        versions: this.cache.versions,
        categories: this.cache.categories
      };
    }

    console.log('[ORCH] getTags() - fetching fresh tags from Modrinth...');
    const [loaders, versions, categories] = await Promise.all([
      this.modrinth.getLoaders(),
      this.modrinth.getGameVersions(),
      this.modrinth.getCategories()
    ]);

    this.cache = { loaders, versions, categories, lastFetched: now };
    console.log(`[ORCH] getTags() - loaders: ${loaders.length}, versions: ${versions.length}, categories: ${categories.length}`);
    return { loaders, versions, categories };
  }

  validateSearchParams(searchParams, tags) {
    if (!searchParams.searchQuery || typeof searchParams.searchQuery !== 'string') {
      searchParams.searchQuery = '';
    }

    if (!VALID_SORT_OPTIONS.includes(searchParams.sortBy)) {
      searchParams.sortBy = 'relevance';
    }

    if (!searchParams.filters || typeof searchParams.filters !== 'object') {
      searchParams.filters = {};
    }

    searchParams.filters.projectType = 'modpack';

    const availableCategories = new Set(tags.categories.map(c => c.name));
    const loaderNames = new Set(tags.loaders.map(l => l.name));

    if (Array.isArray(searchParams.filters.loaders)) {
      searchParams.filters.loaders = searchParams.filters.loaders
        .filter(l => loaderNames.has(l));
    } else {
      searchParams.filters.loaders = [];
    }

    if (Array.isArray(searchParams.filters.categories)) {
      searchParams.filters.categories = searchParams.filters.categories
        .filter(c => availableCategories.has(c));
    } else {
      searchParams.filters.categories = [];
    }

    if (Array.isArray(searchParams.filters.versions)) {
      const availableVersions = new Set(tags.versions.map(v => v.version));
      searchParams.filters.versions = searchParams.filters.versions
        .filter(v => availableVersions.has(v));
    } else {
      searchParams.filters.versions = [];
    }

    if (!Array.isArray(searchParams.alternateQueries)) {
      searchParams.alternateQueries = [];
    }

    return searchParams;
  }

  async searchModrinth(query, facets, sortBy, limit = 50) {
    const result = await this.modrinth.search({
      query,
      facets,
      index: sortBy || 'relevance',
      limit,
      offset: 0
    });
    return result;
  }

  async search(userQuery, onPhase = null) {
    console.log(`[ORCH] search() - query: "${userQuery}"`);

    const provider = this.providerManager.getActive();
    if (!provider) {
      throw new Error('No active AI provider configured');
    }
    console.log(`[ORCH] search() - active provider: ${provider.name}`);

    const emitPhase = (phase) => { if (onPhase) onPhase(phase); };

    emitPhase('parsing');
    const tags = await this.getTags();

    const searchPrompt = fillTemplate(SEARCH_PROMPT, {
      loaders: tags.loaders.map(l => l.name).join(', '),
      versions: tags.versions.slice(0, 30).map(v => v.version).join(', '),
      categories: tags.categories.map(c => c.name).join(', ')
    });

    console.log('[ORCH] Phase 1: Calling AI to parse user query...');
    const searchResponse = await provider.complete([
      { role: 'system', content: searchPrompt },
      { role: 'user', content: userQuery }
    ]);

    console.log('[ORCH] Phase 1 - AI raw response:', searchResponse.substring(0, 500));

    let searchParams;
    try {
      searchParams = parseJsonFromAI(searchResponse);
      searchParams = this.validateSearchParams(searchParams, tags);
      console.log('[ORCH] Phase 1 - parsed params:', JSON.stringify(searchParams, null, 2));
    } catch (e) {
      console.error('[ORCH] Phase 1 - parse error:', e.message);
      console.error('[ORCH] Phase 1 - raw response was:', searchResponse);
      throw new Error('Failed to parse AI search response');
    }

    emitPhase('searching');

    let modrinthResults = await this.searchWithBroadening(searchParams, emitPhase);

    if (!modrinthResults.hits || modrinthResults.hits.length === 0) {
      return {
        results: [],
        searchParams,
        explanation: 'No results found for your query. Try adjusting your search parameters.',
        warnings: ['No modpacks matched the specified criteria']
      };
    }

    emitPhase('ranking');
    console.log(`[ORCH] Phase 3: Ranking ${modrinthResults.hits.length} results...`);

    const rankedData = await this.rankResults(userQuery, searchParams, modrinthResults.hits);

    const enrichedResults = this.enrichResults(rankedData, modrinthResults.hits);

    console.log(`[ORCH] search() complete - returning ${enrichedResults.length} results`);
    return {
      results: enrichedResults,
      searchParams,
      explanation: rankedData.summary || 'Here are the results for your query',
      warnings: rankedData.warnings || []
    };
  }

  async searchWithBroadening(searchParams, emitPhase) {
    // Try local DB first
    if (this.db && this.db.getCount() > 0) {
      console.log('[ORCH] Phase 2: Searching local DB...');
      const localResults = this.searchLocalDB(searchParams);
      if (localResults.length >= MIN_RESULTS_FOR_RANKING) {
        console.log(`[ORCH] Phase 2 - local DB returned ${localResults.length} hits, enough for ranking`);
        return { hits: localResults, totalHits: localResults.length };
      }
      console.log(`[ORCH] Phase 2 - local DB only returned ${localResults.length} hits, supplementing with API...`);
    }

    // Fallback to API with parallel searches
    console.log('[ORCH] Phase 2: Using Modrinth API (parallel)...');
    return this.searchWithBroadeningAPI(searchParams, emitPhase);
  }

  searchLocalDB(searchParams) {
    const { searchQuery, filters, sortBy } = searchParams;
    const results = this.db.search(searchQuery, {
      loaders: filters.loaders || [],
      versions: filters.versions || [],
      categories: filters.categories || [],
      sortBy,
      limit: 50
    });
    return results;
  }

  async searchWithBroadeningAPI(searchParams, emitPhase) {
    const { searchQuery, filters, sortBy, alternateQueries } = searchParams;

    const fullFacets = buildFacets(filters);
    const broadFacets = buildBroadFacets(filters);
    const hasBroadening = fullFacets.length > broadFacets.length;

    console.log('[ORCH] Phase 2: Starting parallel searches...');
    console.log('[ORCH] Phase 2 - fullFacets:', fullFacets);
    console.log('[ORCH] Phase 2 - broadFacets:', broadFacets);

    // Build all search tasks: primary + alternates with full facets + fallbacks
    const tasks = [];

    // Primary: full facets
    tasks.push({ query: searchQuery, facets: fullFacets, label: 'primary-full' });

    // Primary: broad facets (if different from full)
    if (hasBroadening) {
      tasks.push({ query: searchQuery, facets: broadFacets, label: 'primary-broad' });
    }

    // Primary: no facets (maximum broadening)
    tasks.push({ query: searchQuery, facets: [], label: 'primary-nofacets' });

    // Alternate queries with full facets
    if (alternateQueries && alternateQueries.length > 0) {
      for (const altQuery of alternateQueries) {
        tasks.push({ query: altQuery, facets: fullFacets, label: `alt-full:${altQuery}` });
        if (hasBroadening) {
          tasks.push({ query: altQuery, facets: broadFacets, label: `alt-broad:${altQuery}` });
        }
        tasks.push({ query: altQuery, facets: [], label: `alt-nofacets:${altQuery}` });
      }
    }

    console.log(`[ORCH] Phase 2 - launching ${tasks.length} parallel searches...`);

    // Run all searches in parallel
    const settledResults = await Promise.allSettled(
      tasks.map(async (task) => {
        const result = await this.searchModrinth(task.query, task.facets, sortBy);
        return { ...task, hits: result.hits || [], totalHits: result.totalHits || 0 };
      })
    );

    // Collect all successful hits
    const allHits = [];
    for (const settled of settledResults) {
      if (settled.status === 'fulfilled' && settled.value.hits.length > 0) {
        allHits.push(settled.value);
      }
    }

    console.log(`[ORCH] Phase 2 - ${allHits.length}/${tasks.length} searches returned results`);

    if (allHits.length === 0) {
      console.log('[ORCH] Phase 2 - no results found after all searches');
      return { hits: [], totalHits: 0 };
    }

    // Merge and deduplicate, prioritizing primary-full results
    const deduped = this.mergeAndDedup(allHits);
    console.log(`[ORCH] Phase 2 - after dedup: ${deduped.length} unique hits`);

    return { hits: deduped, totalHits: deduped.length };
  }

  mergeAndDedup(searchGroups) {
    // Priority order: primary-full > primary-broad > alt-full > primary-nofacets > alt-broad > alt-nofacets
    const priority = {
      'primary-full': 0,
      'primary-broad': 1,
      'primary-nofacets': 2,
    };

    const getPriority = (label) => {
      if (label.startsWith('alt-full:')) return 3;
      if (label.startsWith('alt-broad:')) return 4;
      if (label.startsWith('alt-nofacets:')) return 5;
      return priority[label] ?? 10;
    };

    // Collect all hits with their source priority
    const seen = new Map(); // slug → { hit, priority }

    for (const group of searchGroups.sort((a, b) => getPriority(a.label) - getPriority(b.label))) {
      for (const hit of group.hits) {
        if (!seen.has(hit.slug)) {
          seen.set(hit.slug, { hit, priority: getPriority(group.label) });
        }
      }
    }

    // Sort by priority (lower = better source) then by Modrinth relevance
    return Array.from(seen.values())
      .sort((a, b) => a.priority - b.priority)
      .map(item => item.hit)
      .slice(0, 50);
  }

  async rankResults(userQuery, searchParams, hits) {
    const rankPrompt = fillTemplate(RANK_PROMPT, {
      userQuery,
      searchParams: JSON.stringify(searchParams, null, 2),
      results: JSON.stringify(hits.slice(0, 25), null, 2)
    });

    const provider = this.providerManager.getActive();

    try {
      const rankResponse = await provider.complete([
        { role: 'system', content: rankPrompt },
        { role: 'user', content: 'Проанализируй результаты и верни рекомендации' }
      ]);

      console.log('[ORCH] Phase 3 - AI raw response:', rankResponse.substring(0, 500));

      const rankedData = parseJsonFromAI(rankResponse);
      rankedData.recommendations = rankedData.recommendations || [];
      rankedData.warnings = rankedData.warnings || [];
      console.log(`[ORCH] Phase 3 - parsed ${rankedData.recommendations.length} recommendations`);
      return rankedData;
    } catch (e) {
      console.error('[ORCH] Phase 3 - parse error:', e.message);
      console.log('[ORCH] Phase 3 - falling back to Modrinth order');
      return {
        recommendations: hits.slice(0, 10).map(h => ({
          slug: h.slug,
          name: h.title,
          explanation: h.description,
          matchQuality: 'partial'
        })),
        summary: 'Search results',
        warnings: []
      };
    }
  }

  enrichResults(rankedData, hits) {
    if (!rankedData.recommendations || !Array.isArray(rankedData.recommendations) || rankedData.recommendations.length === 0) {
      console.log('[ORCH] Phase 3 - no valid recommendations from AI, using Modrinth order');
      return hits.slice(0, 10).map(h => ({
        slug: h.slug,
        name: h.title,
        explanation: truncate(h.description),
        matchQuality: 'partial',
        title: h.title,
        description: truncate(h.description),
        icon_url: h.icon_url || null,
        downloads: h.downloads || 0,
        follows: h.follows || 0,
        categories: h.categories || [],
        versions: h.versions || [],
        project_type: h.project_type || 'modpack',
        url: h.url || `https://modrinth.com/modpack/${h.slug}`
      }));
    }

    const aiSlugs = new Set(rankedData.recommendations.map(r => r.slug));
    const enrichedResults = rankedData.recommendations
      .map(rec => {
        const hit = hits.find(h => h.slug === rec.slug);
        if (!hit) return null;
        return {
          ...rec,
          title: hit.title || rec.name,
          description: truncate(hit.description),
          icon_url: hit.icon_url || null,
          downloads: hit.downloads || 0,
          follows: hit.follows || 0,
          categories: hit.categories || [],
          versions: hit.versions || [],
          project_type: hit.project_type || 'modpack',
          url: hit.url || `https://modrinth.com/modpack/${rec.slug}`
        };
      })
      .filter(Boolean);

    if (enrichedResults.length === 0 && rankedData.recommendations.length > 0) {
      console.log('[ORCH] Phase 3 - AI slugs did not match Modrinth results, using Modrinth order');
      return hits.slice(0, 10).map(h => ({
        slug: h.slug,
        name: h.title,
        explanation: truncate(h.description),
        matchQuality: 'partial',
        title: h.title,
        description: truncate(h.description),
        icon_url: h.icon_url || null,
        downloads: h.downloads || 0,
        follows: h.follows || 0,
        categories: h.categories || [],
        versions: h.versions || [],
        project_type: h.project_type || 'modpack',
        url: h.url || `https://modrinth.com/modpack/${h.slug}`
      }));
    }

    const remaining = hits
      .filter(h => !aiSlugs.has(h.slug))
      .slice(0, 10 - enrichedResults.length);

    if (remaining.length > 0) {
      console.log(`[ORCH] Phase 3 - adding ${remaining.length} more from Modrinth`);
      enrichedResults.push(...remaining.map(h => ({
        slug: h.slug,
        name: h.title,
        explanation: truncate(h.description),
        matchQuality: 'partial',
        title: h.title,
        description: truncate(h.description),
        icon_url: h.icon_url || null,
        downloads: h.downloads || 0,
        follows: h.follows || 0,
        categories: h.categories || [],
        versions: h.versions || [],
        project_type: h.project_type || 'modpack',
        url: h.url || `https://modrinth.com/modpack/${h.slug}`
      })));
    }

    return enrichedResults;
  }
}

module.exports = Orchestrator;
