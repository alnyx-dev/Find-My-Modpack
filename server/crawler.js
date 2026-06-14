const ModpackDB = require('./db');
const ModrinthClient = require('./modrinth/client');

const BATCH_SIZE = 100;
const DELAY_MS = 1000;
const MAX_RETRIES = 3;
const MAX_OFFSET = 20000;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function crawlAll() {
  console.log('[CRAWLER] Starting full modpack crawl from Modrinth...');
  const modrinth = new ModrinthClient();
  const db = new ModpackDB().init();

  let offset = 0;
  let totalHits = null;
  let crawled = 0;
  let retries = 0;

  while (true) {
    try {
      const data = await modrinth.search({
        query: '',
        facets: [['project_type:modpack']],
        index: 'relevance',
        limit: BATCH_SIZE,
        offset
      });

      if (totalHits === null) {
        totalHits = data.totalHits || 0;
        if (totalHits > 0) {
          console.log(`[CRAWLER] Total modpacks on Modrinth: ${totalHits}`);
        }
      }

      if (!data.hits || data.hits.length === 0) {
        console.log(`[CRAWLER] No more results at offset ${offset}`);
        break;
      }

      // Save batch to DB
      db.upsertModpacks(data.hits);
      crawled += data.hits.length;
      retries = 0;

      const pct = totalHits > 0 ? Math.round(crawled / totalHits * 100) : '?';
      console.log(`[CRAWLER] Crawled ${crawled}${totalHits > 0 ? '/' + totalHits : ''} (${pct}%)`);

      if (data.hits.length < BATCH_SIZE) {
        console.log('[CRAWLER] Last batch smaller than batch size, done');
        break;
      }

      offset += BATCH_SIZE;

      if (offset >= MAX_OFFSET) {
        console.log(`[CRAWLER] Reached max offset ${MAX_OFFSET}, stopping`);
        break;
      }

      await sleep(DELAY_MS);

    } catch (e) {
      if (e.message.includes('429') || e.message.includes('rate limit')) {
        retries++;
        if (retries > MAX_RETRIES) {
          console.error(`[CRAWLER] Too many retries at offset ${offset}, stopping`);
          break;
        }
        const waitMs = DELAY_MS * retries * 2;
        console.log(`[CRAWLER] Rate limited, waiting ${waitMs}ms (retry ${retries}/${MAX_RETRIES})...`);
        await sleep(waitMs);
      } else {
        console.error(`[CRAWLER] Error at offset ${offset}:`, e.message);
        retries++;
        if (retries > MAX_RETRIES) {
          console.error('[CRAWLER] Too many errors, stopping');
          break;
        }
        await sleep(DELAY_MS * 2);
      }
    }
  }

  console.log(`[CRAWLER] Done! Total crawled: ${crawled} modpacks`);
  console.log(`[CRAWLER] DB contains ${db.getCount()} modpacks`);
  console.log(`[CRAWLER] Last crawl: ${db.getLastCrawl()}`);

  db.close();
}

if (require.main === module) {
  crawlAll().catch(e => {
    console.error('[CRAWLER] Fatal error:', e);
    process.exit(1);
  });
}

module.exports = { crawlAll };
