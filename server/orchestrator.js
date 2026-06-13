const ModrinthClient = require('./modrinth/client');
const { buildFacets } = require('./modrinth/facets');
const { SEARCH_PROMPT, RANK_PROMPT } = require('./prompts');

class Orchestrator {
  constructor(providerManager) {
    this.providerManager = providerManager;
    this.modrinth = new ModrinthClient();
    this.cache = {
      loaders: null,
      versions: null,
      categories: null
    };
  }

  async getTags() {
    console.log('[ORCH] getTags() - fetching tags from Modrinth...');
    const [loaders, versions, categories] = await Promise.all([
      this.cache.loaders || this.modrinth.getLoaders(),
      this.cache.versions || this.modrinth.getGameVersions(),
      this.cache.categories || this.modrinth.getCategories()
    ]);

    this.cache.loaders = loaders;
    this.cache.versions = versions;
    this.cache.categories = categories;

    console.log(`[ORCH] getTags() - loaders: ${loaders.length}, versions: ${versions.length}, categories: ${categories.length}`);
    return { loaders, versions, categories };
  }

  async search(userQuery, onPhase = null) {
    console.log(`[ORCH] search() - query: "${userQuery}"`);

    const provider = this.providerManager.getActive();
    if (!provider) {
      console.error('[ORCH] search() - no active provider!');
      throw new Error('No active AI provider configured');
    }
    console.log(`[ORCH] search() - active provider: ${provider.name}`);

    const emitPhase = (phase) => {
      if (onPhase) onPhase(phase);
    };

    emitPhase('parsing');
    const tags = await this.getTags();

    const searchPrompt = SEARCH_PROMPT
      .replace('{loaders}', tags.loaders.map(l => l.name).join(', '))
      .replace('{versions}', tags.versions.slice(0, 20).map(v => v.version).join(', '))
      .replace('{categories}', tags.categories.map(c => c.name).join(', '));

    console.log('[ORCH] Phase 1: Calling AI to parse user query...');
    const searchResponse = await provider.complete([
      { role: 'system', content: searchPrompt },
      { role: 'user', content: userQuery }
    ]);

    console.log('[ORCH] Phase 1 - AI raw response:', searchResponse.substring(0, 500));

    let searchParams;
    try {
      let cleaned = searchResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      searchParams = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      console.log('[ORCH] Phase 1 - parsed params:', JSON.stringify(searchParams, null, 2));
    } catch (e) {
      console.error('[ORCH] Phase 1 - JSON parse error:', e.message);
      console.error('[ORCH] Phase 1 - raw response was:', searchResponse);
      throw new Error('Failed to parse AI search response');
    }

    emitPhase('searching');
    let facets = buildFacets(searchParams.filters || {});
    console.log('[ORCH] Phase 2: Searching Modrinth...', {
      query: searchParams.searchQuery,
      facets,
      index: searchParams.sortBy,
      limit: 30
    });

    let modrinthResults = await this.modrinth.search({
      query: searchParams.searchQuery,
      facets,
      index: searchParams.sortBy || 'relevance',
      limit: 30
    });

    console.log(`[ORCH] Phase 2 - Modrinth returned ${modrinthResults.hits?.length || 0} hits`);

    if (!modrinthResults.hits || modrinthResults.hits.length < 3) {
      console.log('[ORCH] Phase 2 - too few results, trying broader search...');

      const broaderFacets = buildFacets({
        projectType: searchParams.filters?.projectType
      });
      console.log('[ORCH] Phase 2 - broader search facets:', broaderFacets);

      modrinthResults = await this.modrinth.search({
        query: searchParams.searchQuery,
        facets: broaderFacets,
        index: searchParams.sortBy || 'relevance',
        limit: 30
      });

      console.log(`[ORCH] Phase 2 - broader search returned ${modrinthResults.hits?.length || 0} hits`);

      if (!modrinthResults.hits || modrinthResults.hits.length < 3) {
        console.log('[ORCH] Phase 2 - still too few, trying with just query...');
        modrinthResults = await this.modrinth.search({
          query: searchParams.searchQuery,
          facets: [],
          index: searchParams.sortBy || 'relevance',
          limit: 30
        });
        console.log(`[ORCH] Phase 2 - query-only search returned ${modrinthResults.hits?.length || 0} hits`);
      }
    }

    if (!modrinthResults.hits || modrinthResults.hits.length === 0) {
      console.log('[ORCH] Phase 2 - no results found');
      return {
        results: [],
        searchParams,
        explanation: 'По вашему запросу ничего не найдено. Попробуйте изменить параметры поиска.',
        warnings: ['Не найдено ни одного модпака по заданным критериям']
      };
    }

    console.log(`[ORCH] Phase 2 - Modrinth returned ${modrinthResults.hits.length} hits, will show all`);

    emitPhase('ranking');
    console.log('[ORCH] Phase 3: Ranking and explaining results...');
    const rankPrompt = RANK_PROMPT
      .replace('{userQuery}', userQuery)
      .replace('{searchParams}', JSON.stringify(searchParams, null, 2))
      .replace('{results}', JSON.stringify(modrinthResults.hits.slice(0, 15), null, 2));

    const rankResponse = await provider.complete([
      { role: 'system', content: rankPrompt },
      { role: 'user', content: 'Проанализируй результаты и верни рекомендации' }
    ]);

    console.log('[ORCH] Phase 3 - AI raw response:', rankResponse.substring(0, 500));

    let rankedData;
    try {
      let cleaned = rankResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      rankedData = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      console.log(`[ORCH] Phase 3 - parsed ${rankedData.recommendations?.length || 0} recommendations`);
    } catch (e) {
      console.error('[ORCH] Phase 3 - JSON parse error:', e.message);
      console.log('[ORCH] Phase 3 - falling back to Modrinth order');
      rankedData = {
        recommendations: modrinthResults.hits.slice(0, 10).map(h => ({
          slug: h.slug,
          name: h.title,
          explanation: h.description
        })),
        summary: 'Результаты поиска',
        warnings: []
      };
    }

    const aiSlugs = new Set(rankedData.recommendations.map(r => r.slug));
    const remaining = modrinthResults.hits
      .filter(h => !aiSlugs.has(h.slug))
      .slice(0, 10 - rankedData.recommendations.length);

    if (remaining.length > 0) {
      console.log(`[ORCH] Phase 3 - adding ${remaining.length} more from Modrinth`);
      rankedData.recommendations.push(...remaining.map(h => ({
        slug: h.slug,
        name: h.title,
        explanation: h.description
      })));
    }

    const enrichedResults = rankedData.recommendations
      .map(rec => {
        const modrinthHit = modrinthResults.hits.find(h => h.slug === rec.slug);
        if (!modrinthHit) return null;
        return {
          ...rec,
          title: modrinthHit.title || rec.name,
          description: modrinthHit.description || '',
          icon_url: modrinthHit.icon_url || null,
          downloads: modrinthHit.downloads || 0,
          follows: modrinthHit.follows || 0,
          categories: modrinthHit.categories || [],
          versions: modrinthHit.versions || [],
          project_type: modrinthHit.project_type || 'modpack',
          url: modrinthHit.url || `https://modrinth.com/modpack/${rec.slug}`
        };
      })
      .filter(Boolean);

    if (enrichedResults.length === 0 && rankedData.recommendations.length > 0) {
      console.log('[ORCH] Phase 3 - AI slugs did not match Modrinth results, using Modrinth order');
      enrichedResults.push(...modrinthResults.hits.slice(0, 10).map(h => ({
        slug: h.slug,
        name: h.title,
        explanation: h.description,
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

    console.log(`[ORCH] search() complete - returning ${enrichedResults.length} results`);
    return {
      results: enrichedResults,
      searchParams,
      explanation: rankedData.summary || 'Вот что я нашел по вашему запросу',
      warnings: rankedData.warnings || []
    };
  }
}

module.exports = Orchestrator;
