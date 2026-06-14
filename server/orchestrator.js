const ModrinthClient = require('./modrinth/client');
const { buildFacets, buildBroadFacets } = require('./modrinth/facets');
const { SEARCH_PROMPT, RANK_PROMPT } = require('./prompts');

const VALID_SORT_OPTIONS = ['relevance', 'downloads', 'follows', 'newest', 'updated'];
const CACHE_TTL = 3600000;
const MIN_RESULTS_FOR_RANKING = 5;

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
    this.cache = {
      loaders: null,
      versions: null,
      categories: null,
      lastFetched: 0
    };
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

    if (!Array.isArray(searchParams.filters.versions)) {
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
        explanation: 'По вашему запросу ничего не найдено. Попробуйте изменить параметры поиска.',
        warnings: ['Не найдено ни одного модпака по заданным критериям']
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
      explanation: rankedData.summary || 'Вот что я нашел по вашему запросу',
      warnings: rankedData.warnings || []
    };
  }

  async searchWithBroadening(searchParams, emitPhase) {
    const { searchQuery, filters, sortBy, alternateQueries } = searchParams;

    const fullFacets = buildFacets(filters);
    console.log('[ORCH] Phase 2: Full facets search...', { query: searchQuery, facets: fullFacets });

    let results = await this.searchModrinth(searchQuery, fullFacets, sortBy);

    if (results.hits && results.hits.length >= MIN_RESULTS_FOR_RANKING) {
      console.log(`[ORCH] Phase 2 - full search returned ${results.hits.length} hits, enough for ranking`);
      return results;
    }

    console.log(`[ORCH] Phase 2 - too few results (${results.hits?.length || 0}), trying step-by-step broadening...`);

    const broadFacets = buildBroadFacets(filters);
    if (fullFacets.length > broadFacets.length) {
      console.log('[ORCH] Phase 2 - trying broad facets (projectType only)...');
      results = await this.searchModrinth(searchQuery, broadFacets, sortBy);
      if (results.hits && results.hits.length >= MIN_RESULTS_FOR_RANKING) {
        console.log(`[ORCH] Phase 2 - broad facets returned ${results.hits.length} hits`);
        return results;
      }
    }

    if (alternateQueries && alternateQueries.length > 0) {
      for (const altQuery of alternateQueries) {
        console.log(`[ORCH] Phase 2 - trying alternate query: "${altQuery}"`);
        const altResults = await this.searchModrinth(altQuery, broadFacets, sortBy);
        if (altResults.hits && altResults.hits.length > results.hits.length) {
          results = altResults;
          if (results.hits.length >= MIN_RESULTS_FOR_RANKING) {
            console.log(`[ORCH] Phase 2 - alternate query returned ${results.hits.length} hits`);
            return results;
          }
        }
      }
    }

    console.log('[ORCH] Phase 2 - trying query-only (no facets)...');
    const queryOnlyResults = await this.searchModrinth(searchQuery, [], sortBy);
    if (queryOnlyResults.hits && queryOnlyResults.hits.length > results.hits.length) {
      results = queryOnlyResults;
    }

    if (results.hits && results.hits.length > 0) {
      console.log(`[ORCH] Phase 2 - best result: ${results.hits.length} hits`);
      return results;
    }

    if (alternateQueries && alternateQueries.length > 0) {
      console.log('[ORCH] Phase 2 - trying alternate queries with no facets...');
      for (const altQuery of alternateQueries) {
        const altResults = await this.searchModrinth(altQuery, [], sortBy);
        if (altResults.hits && altResults.hits.length > 0) {
          console.log(`[ORCH] Phase 2 - alternate query (no facets) returned ${altResults.hits.length} hits`);
          return altResults;
        }
      }
    }

    console.log('[ORCH] Phase 2 - no results found after all broadening attempts');
    return { hits: [], totalHits: 0 };
  }

  async rankResults(userQuery, searchParams, hits) {
    const rankPrompt = fillTemplate(RANK_PROMPT, {
      userQuery,
      searchParams: JSON.stringify(searchParams, null, 2),
      results: JSON.stringify(hits.slice(0, 15), null, 2)
    });

    const provider = this.providerManager.getActive();

    try {
      const rankResponse = await provider.complete([
        { role: 'system', content: rankPrompt },
        { role: 'user', content: 'Проанализируй результаты и верни рекомендации' }
      ]);

      console.log('[ORCH] Phase 3 - AI raw response:', rankResponse.substring(0, 500));

      const rankedData = parseJsonFromAI(rankResponse);
      console.log(`[ORCH] Phase 3 - parsed ${rankedData.recommendations?.length || 0} recommendations`);
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
        summary: 'Результаты поиска',
        warnings: []
      };
    }
  }

  enrichResults(rankedData, hits) {
    const aiSlugs = new Set(rankedData.recommendations.map(r => r.slug));
    const enrichedResults = rankedData.recommendations
      .map(rec => {
        const hit = hits.find(h => h.slug === rec.slug);
        if (!hit) return null;
        return {
          ...rec,
          title: hit.title || rec.name,
          description: hit.description || '',
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
        explanation: h.description,
        matchQuality: 'partial',
        title: h.title,
        description: h.description || '',
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
        explanation: h.description,
        matchQuality: 'partial',
        title: h.title,
        description: h.description || '',
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
