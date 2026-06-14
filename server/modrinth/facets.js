function buildFacets({ projectType, loaders, versions, categories }) {
  const facets = [];

  if (projectType) {
    facets.push([`project_type:${projectType}`]);
  }

  if (loaders && loaders.length > 0) {
    facets.push(loaders.map(l => `categories:${l}`));
  }

  if (versions && versions.length > 0) {
    facets.push(versions.map(v => `versions:${v}`));
  }

  if (categories && categories.length > 0) {
    facets.push(categories.map(c => `categories:${c}`));
  }

  return facets;
}

function buildBroadFacets({ projectType }) {
  const facets = [];

  if (projectType) {
    facets.push([`project_type:${projectType}`]);
  }

  return facets;
}

module.exports = { buildFacets, buildBroadFacets };
