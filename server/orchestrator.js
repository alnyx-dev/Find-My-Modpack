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
    const [loaders, versions, categories] = await Promise.all([
      this.cache.loaders || this.modrinth.getLoaders(),
      this.cache.versions || this.modrinth.getGameVersions(),
      this.cache.categories || this.modrinth.getCategories()
    ]);

    this.cache.loaders = loaders;
    this.cache.versions = versions;
    this.cache.categories = categories;

    return { loaders, versions, categories };
  }

  async search(userQuery) {
    const provider = this.providerManager.getActive();
    if (!provider) {
      throw new Error('No active AI provider configured');
    }

    const tags = await this.getTags();

    const searchPrompt = SEARCH_PROMPT
      .replace('{loaders}', tags.loaders.map(l => l.name).join(', '))
      .replace('{versions}', tags.versions.slice(0, 20).map(v => v.version).join(', '))
      .replace('{categories}', tags.categories.map(c => c.name).join(', '));

    const searchResponse = await provider.complete([
      { role: 'system', content: searchPrompt },
      { role: 'user', content: userQuery }
    ], { max_tokens: 500 });

    let searchParams;
    try {
      const jsonMatch = searchResponse.match(/\{[\s\S]*\}/);
      searchParams = JSON.parse(jsonMatch ? jsonMatch[0] : searchResponse);
    } catch (e) {
      throw new Error('Failed to parse AI search response');
    }

    const facets = buildFacets(searchParams.filters || {});
    const modrinthResults = await this.modrinth.search({
      query: searchParams.searchQuery,
      facets,
      index: searchParams.sortBy || 'relevance',
      limit: 20
    });

    if (!modrinthResults.hits || modrinthResults.hits.length === 0) {
      return {
        results: [],
        searchParams,
        explanation: 'По вашему запросу ничего не найдено. Попробуйте изменить параметры поиска.',
        warnings: ['Не найдено ни одного модпака по заданным критериям']
      };
    }

    const rankPrompt = RANK_PROMPT
      .replace('{userQuery}', userQuery)
      .replace('{searchParams}', JSON.stringify(searchParams, null, 2))
      .replace('{results}', JSON.stringify(modrinthResults.hits.slice(0, 10), null, 2));

    const rankResponse = await provider.complete([
      { role: 'system', content: rankPrompt },
      { role: 'user', content: 'Проанализируй результаты и верни рекомендации' }
    ], { max_tokens: 1500 });

    let rankedData;
    try {
      const jsonMatch = rankResponse.match(/\{[\s\S]*\}/);
      rankedData = JSON.parse(jsonMatch ? jsonMatch[0] : rankResponse);
    } catch (e) {
      rankedData = {
        recommendations: modrinthResults.hits.slice(0, 5).map(h => ({
          slug: h.slug,
          name: h.title,
          explanation: h.description
        })),
        summary: 'Результаты поиска',
        warnings: []
      };
    }

    const enrichedResults = rankedData.recommendations.map(rec => {
      const modrinthHit = modrinthResults.hits.find(h => h.slug === rec.slug);
      return {
        ...rec,
        title: modrinthHit?.title || rec.name,
        description: modrinthHit?.description || '',
        icon_url: modrinthHit?.icon_url || null,
        downloads: modrinthHit?.downloads || 0,
        follows: modrinthHit?.follows || 0,
        categories: modrinthHit?.categories || [],
        versions: modrinthHit?.versions || [],
        project_type: modrinthHit?.project_type || 'modpack',
        url: modrinthHit?.url || `https://modrinth.com/modpack/${rec.slug}`
      };
    });

    return {
      results: enrichedResults,
      searchParams,
      explanation: rankedData.summary || 'Вот что я нашел по вашему запросу',
      warnings: rankedData.warnings || []
    };
  }
}

module.exports = Orchestrator;
