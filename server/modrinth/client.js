const BASE_URL = 'https://api.modrinth.com/v2';

class ModrinthClient {
  async search({ query, facets, index = 'relevance', limit = 20, offset = 0 }) {
    const params = new URLSearchParams({
      query: query || '',
      index,
      limit: limit.toString(),
      offset: offset.toString()
    });

    if (facets && facets.length > 0) {
      params.append('facets', JSON.stringify(facets));
    }

    const response = await fetch(`${BASE_URL}/search?${params}`, {
      headers: {
        'User-Agent': 'ModrinthAI-Search/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Modrinth API error: ${response.status}`);
    }

    return response.json();
  }

  async getCategories() {
    const response = await fetch(`${BASE_URL}/tag/category`, {
      headers: { 'User-Agent': 'ModrinthAI-Search/1.0' }
    });
    if (!response.ok) throw new Error(`Failed to fetch categories: ${response.status}`);
    return response.json();
  }

  async getLoaders() {
    const response = await fetch(`${BASE_URL}/tag/loader`, {
      headers: { 'User-Agent': 'ModrinthAI-Search/1.0' }
    });
    if (!response.ok) throw new Error(`Failed to fetch loaders: ${response.status}`);
    return response.json();
  }

  async getGameVersions() {
    const response = await fetch(`${BASE_URL}/tag/game_version`, {
      headers: { 'User-Agent': 'ModrinthAI-Search/1.0' }
    });
    if (!response.ok) throw new Error(`Failed to fetch game versions: ${response.status}`);
    return response.json();
  }

  async getProject(slugOrId) {
    const response = await fetch(`${BASE_URL}/project/${slugOrId}`, {
      headers: { 'User-Agent': 'ModrinthAI-Search/1.0' }
    });
    if (!response.ok) throw new Error(`Failed to fetch project: ${response.status}`);
    return response.json();
  }
}

module.exports = ModrinthClient;
