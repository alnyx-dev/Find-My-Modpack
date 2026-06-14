const BASE_URL = 'https://api.modrinth.com/v2';
const FETCH_TIMEOUT = 10000;
const MAX_RETRIES = 3;

class ModrinthClient {
  async _fetch(url, retries = 0) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FindMyModpack/1.0' },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 429 && retries < MAX_RETRIES) {
        const resetMs = parseInt(response.headers.get('X-Ratelimit-Reset') || '5000', 10);
        const delay = Math.min(resetMs, 5000) * (retries + 1);
        console.log(`[MODRINTH] Rate limited, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, delay));
        return this._fetch(url, retries + 1);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Modrinth API error: ${response.status} - ${text.substring(0, 200)}`);
      }

      return response.json();
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') {
        throw new Error('Modrinth API request timed out (10s)');
      }
      throw e;
    }
  }

  async search({ query, facets, index = 'relevance', limit = 50, offset = 0 }) {
    console.log(`[MODRINTH] search() query="${query}" index=${index} limit=${limit} offset=${offset}`);
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

    const data = await this._fetch(url);

    if (!Array.isArray(data.hits)) {
      console.error('[MODRINTH] search() unexpected response shape:', JSON.stringify(data).substring(0, 300));
      return { hits: [], totalHits: 0 };
    }

    const totalHits = data.totalHits || data.total_hits || 0;
    console.log(`[MODRINTH] search() returned ${data.hits.length} hits, totalHits=${totalHits}`);
    return { hits: data.hits, totalHits };
  }

  async getCategories() {
    console.log('[MODRINTH] getCategories()');
    const data = await this._fetch(`${BASE_URL}/tag/category`);
    console.log(`[MODRINTH] getCategories() returned ${data.length} items`);
    return Array.isArray(data) ? data : [];
  }

  async getLoaders() {
    console.log('[MODRINTH] getLoaders()');
    const data = await this._fetch(`${BASE_URL}/tag/loader`);
    console.log(`[MODRINTH] getLoaders() returned ${data.length} items`);
    return Array.isArray(data) ? data : [];
  }

  async getGameVersions() {
    console.log('[MODRINTH] getGameVersions()');
    const data = await this._fetch(`${BASE_URL}/tag/game_version`);
    console.log(`[MODRINTH] getGameVersions() returned ${data.length} items`);
    return Array.isArray(data) ? data : [];
  }
}

module.exports = ModrinthClient;
