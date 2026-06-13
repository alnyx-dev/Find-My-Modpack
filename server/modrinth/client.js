const BASE_URL = 'https://api.modrinth.com/v2';

class ModrinthClient {
  async search({ query, facets, index = 'relevance', limit = 20, offset = 0 }) {
    console.log(`[MODRINTH] search() query="${query}" index=${index} limit=${limit}`);
    console.log(`[MODRINTH] search() facets:`, facets);

    const params = new URLSearchParams({
      query: query || '',
      index,
      limit: limit.toString(),
      offset: offset.toString()
    });

    if (facets && facets.length > 0) {
      params.append('facets', JSON.stringify(facets));
    }

    const url = `${BASE_URL}/search?${params}`;
    console.log(`[MODRINTH] search() URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FindMyModpack/1.0'
      }
    });

    console.log(`[MODRINTH] search() status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`[MODRINTH] search() error body: ${text}`);
      throw new Error(`Modrinth API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[MODRINTH] search() returned ${data.hits?.length || 0} hits, total=${data.totalHits || 0}`);
    return data;
  }

  async getCategories() {
    console.log('[MODRINTH] getCategories()');
    const response = await fetch(`${BASE_URL}/tag/category`, {
      headers: { 'User-Agent': 'FindMyModpack/1.0' }
    });
    console.log(`[MODRINTH] getCategories() status: ${response.status}`);
    if (!response.ok) throw new Error(`Failed to fetch categories: ${response.status}`);
    const data = await response.json();
    console.log(`[MODRINTH] getCategories() returned ${data.length} items`);
    return data;
  }

  async getLoaders() {
    console.log('[MODRINTH] getLoaders()');
    const response = await fetch(`${BASE_URL}/tag/loader`, {
      headers: { 'User-Agent': 'FindMyModpack/1.0' }
    });
    console.log(`[MODRINTH] getLoaders() status: ${response.status}`);
    if (!response.ok) throw new Error(`Failed to fetch loaders: ${response.status}`);
    const data = await response.json();
    console.log(`[MODRINTH] getLoaders() returned ${data.length} items`);
    return data;
  }

  async getGameVersions() {
    console.log('[MODRINTH] getGameVersions()');
    const response = await fetch(`${BASE_URL}/tag/game_version`, {
      headers: { 'User-Agent': 'FindMyModpack/1.0' }
    });
    console.log(`[MODRINTH] getGameVersions() status: ${response.status}`);
    if (!response.ok) throw new Error(`Failed to fetch game versions: ${response.status}`);
    const data = await response.json();
    console.log(`[MODRINTH] getGameVersions() returned ${data.length} items`);
    return data;
  }

  async getProject(slugOrId) {
    console.log(`[MODRINTH] getProject(${slugOrId})`);
    const response = await fetch(`${BASE_URL}/project/${slugOrId}`, {
      headers: { 'User-Agent': 'FindMyModpack/1.0' }
    });
    console.log(`[MODRINTH] getProject() status: ${response.status}`);
    if (!response.ok) throw new Error(`Failed to fetch project: ${response.status}`);
    return response.json();
  }
}

module.exports = ModrinthClient;
