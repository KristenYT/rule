const RESOURCE_SITES = `
非凡影视,http://ffzy4.tv/api.php/provide/vod/
如意资源站,https://cj.rycjapi.com/api.php/provide/vod/at/json/
量子资源站,https://cj.lziapi.com/api.php/provide/vod/at/json/
爱奇艺资源站,https://iqiyizyapi.com/api.php/provide/vod/
电影天堂,https://web.yy4747.com/
`;

const CHINESE_NUM_MAP = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
};

WidgetMetadata = {
  id: "vod_stream",
  title: "VOD Stream",
  icon: "https://assets.vvebo.vip/scripts/icon.png",
  version: "1.3.1",
  requiredVersion: "0.0.1",
  description: "通过 TMDB ID 获取聚合 VOD 影片资源",
  author: "两块",
  site: "https://github.com/2kuai/ForwardWidgets",
  globalParams: [
    {
      name: "multiSource",
      title: "是否启用聚合搜索",
      type: "enumeration",
      enumOptions: [
        { title: "启用", value: "enabled" },
        { title: "禁用", value: "disabled" }
      ]
    },
    {
      name: "VodData",
      title: "JSON或CSV格式的源配置",
      type: "input",
      value: RESOURCE_SITES
    }
  ],
  modules: [
    {
      id: "loadResource",
      title: "加载资源",
      functionName: "loadResource",
      type: "stream",
      params: [],
    }
  ],
};

// --- 辅助工具函数 ---

const isM3U8Url = (url) => url?.toLowerCase().includes('m3u8') || false;

function unique(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = `${value || ''}`.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTitleForCompare(title) {
  return `${title || ''}`
    .replace(/[：:·・.。!！?？\s_-]/g, '')
    .toLowerCase();
}

function extractSeasonInfo(seriesName) {
  if (!seriesName) return { baseName: seriesName, seasonNumber: 1 };
  const chineseMatch = seriesName.match(/第([一二三四五六七八九十\d]+)[季部]/);
  if (chineseMatch) {
    const val = chineseMatch[1];
    const seasonNum = CHINESE_NUM_MAP[val] || parseInt(val) || 1;
    const baseName = seriesName.replace(/第[一二三四五六七八九十\d]+[季部]/, '').trim();
    return { baseName, seasonNumber: seasonNum };
  }
  const digitMatch = seriesName.match(/(.+?)(\d+)$/);
  if (digitMatch) {
    return { baseName: digitMatch[1].trim(), seasonNumber: parseInt(digitMatch[2]) || 1 };
  }
  return { baseName: seriesName.trim(), seasonNumber: 1 };
}

function getTmdbId(params) {
  const explicitId = params.tmdbId || params.tmdbID || params.tmdb_id;
  if (explicitId) {
    const match = `${explicitId}`.match(/\d+/);
    if (match) return match[0];
  }

  const packedId = `${params.id || ''}`;
  const packedMatch = packedId.match(/^(?:movie|tv)\.(\d+)$/i);
  return packedMatch ? packedMatch[1] : null;
}

function getMediaType(type) {
  return type === 'movie' ? 'movie' : 'tv';
}

async function storageGet(key) {
  try {
    const value = Widget.storage.get(key);
    const resolved = typeof value?.then === 'function' ? await value : value;
    if (typeof resolved === 'string') {
      try {
        return JSON.parse(resolved);
      } catch (e) {
        return resolved;
      }
    }
    return resolved;
  } catch (e) {
    return null;
  }
}

async function storageSet(key, value, ttl) {
  try {
    const result = Widget.storage.set(key, value, ttl);
    if (typeof result?.then === 'function') await result;
  } catch (e) {
    try {
      const result = Widget.storage.set(key, JSON.stringify(value), ttl);
      if (typeof result?.then === 'function') await result;
    } catch (err) {}
  }
}

function pushTitle(names, title) {
  const cleaned = `${title || ''}`.trim();
  if (cleaned) names.push(cleaned);
}

function pushTranslationTitles(names, translations, type) {
  const translationList = translations?.translations || [];
  const preferred = translationList.filter(item => {
    const lang = `${item.iso_639_1 || ''}`.toLowerCase();
    const region = `${item.iso_3166_1 || ''}`.toUpperCase();
    return lang === 'zh' && ['CN', 'SG', 'HK', 'TW', 'MO', ''].includes(region);
  });

  preferred.forEach(item => {
    const data = item.data || {};
    pushTitle(names, type === 'movie' ? data.title : data.name);
  });
}

function pushAlternativeTitles(names, alternativeTitles) {
  const titles = alternativeTitles?.titles || alternativeTitles?.results || [];
  const preferred = titles.filter(item => {
    const region = `${item.iso_3166_1 || ''}`.toUpperCase();
    return ['CN', 'SG', 'HK', 'TW', 'MO', ''].includes(region);
  });

  preferred.forEach(item => pushTitle(names, item.title));
}

async function resolveTmdbSearchNames(tmdbId, type, fallbackNames) {
  const safeFallbackNames = unique(fallbackNames);
  if (!tmdbId || !Widget.tmdb?.get) return safeFallbackNames;

  const mediaType = getMediaType(type);
  const cacheKey = `vod_tmdb_names_${mediaType}_${tmdbId}`;
  const cached = await storageGet(cacheKey);
  if (Array.isArray(cached) && cached.length > 0) {
    return unique([...cached, ...safeFallbackNames]).slice(0, 8);
  }

  try {
    const detail = await Widget.tmdb.get(`${mediaType}/${tmdbId}`, {
      params: {
        language: 'zh-CN',
        append_to_response: 'alternative_titles,translations'
      }
    });

    const names = [];
    pushTitle(names, mediaType === 'movie' ? detail.title : detail.name);
    pushTranslationTitles(names, detail.translations, mediaType);
    pushAlternativeTitles(names, detail.alternative_titles);
    pushTitle(names, mediaType === 'movie' ? detail.original_title : detail.original_name);

    const resolvedNames = unique([...names, ...safeFallbackNames]).slice(0, 8);
    if (resolvedNames.length > 0) {
      await storageSet(cacheKey, resolvedNames, 86400);
    }
    return resolvedNames;
  } catch (e) {
    return safeFallbackNames;
  }
}

function buildCandidateNameSet(searchNames) {
  const names = searchNames.flatMap(name => {
    const info = extractSeasonInfo(name);
    return [name, info.baseName];
  });
  return new Set(unique(names).map(normalizeTitleForCompare));
}

function itemMatchesSearchNames(itemName, candidateNameSet) {
  const itemInfo = extractSeasonInfo(itemName);
  return candidateNameSet.has(normalizeTitleForCompare(itemName)) ||
    candidateNameSet.has(normalizeTitleForCompare(itemInfo.baseName));
}

function decodeHtmlEntities(value) {
  return `${value || ''}`
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value) {
  return decodeHtmlEntities(`${value || ''}`.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function getHtmlText(response) {
  const data = response?.data;
  return typeof data === 'string' ? data : JSON.stringify(data || '');
}

function toAbsoluteUrl(baseUrl, path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = `${baseUrl || ''}`.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function isYy4747Site(site) {
  return /yy4747\.com|dy1996\.com/i.test(site?.value || '');
}

function parseEpisodeNumber(text) {
  const cleaned = stripHtml(text);
  const match = cleaned.match(/第\s*0*(\d+)\s*集/) || cleaned.match(/^0*(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

function extractYy4747SearchItems(html, baseUrl) {
  const itemBlocks = html.match(/<a\b[^>]*class=["'][^"']*search-result-item[^"']*["'][^>]*>[\s\S]*?<\/a>/g) || [];
  return itemBlocks.map(block => {
    const href = block.match(/href=["']([^"']*\/voddetail\/\d+\/?)['"]/i)?.[1];
    const title = block.match(/<div\b[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
      block.match(/alt=["']([^"']+)["']/i)?.[1];
    const category = block.match(/search-result-item-header[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    return {
      title: stripHtml(title),
      category: stripHtml(category),
      detailUrl: toAbsoluteUrl(baseUrl, href)
    };
  }).filter(item => item.title && item.detailUrl);
}

function extractYy4747PlayLinks(html, baseUrl, type, targetEpisode) {
  const links = [];
  const seen = new Set();
  const linkRegex = /<a\b[^>]*href=["']([^"']*\/vodplay\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const episodeName = stripHtml(match[2]);
    const episodeNumber = parseEpisodeNumber(episodeName);
    const playUrl = toAbsoluteUrl(baseUrl, match[1]);
    if (!playUrl || seen.has(playUrl)) continue;
    if (type === 'tv') {
      if (!episodeNumber) continue;
      if (targetEpisode !== null && episodeNumber !== targetEpisode) continue;
    }
    seen.add(playUrl);
    links.push({ episodeName, episodeNumber, playUrl });
  }
  return type === 'movie' ? links.slice(0, 1) : links;
}

function extractYy4747M3u8(html) {
  const match = html.match(/src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
    html.match(/["']([^"']+\.m3u8[^"']*)["']/i);
  return match ? decodeHtmlEntities(match[1]).trim() : null;
}

async function fetchYy4747PlayResource(site, item, playLink, type) {
  const response = await Widget.http.get(playLink.playUrl, { timeout: 10000 });
  const html = getHtmlText(response);
  const url = extractYy4747M3u8(html);
  if (!url || !isM3U8Url(url)) return null;

  const label = type === 'tv' ? playLink.episodeName : '正片';
  return {
    name: site.title,
    description: `${item.title} - ${label} - [网页源]`,
    url,
    _ep: playLink.episodeNumber
  };
}

async function fetchYy4747Resources(site, queryName, type, targetSeason, targetEpisode, candidateNameSet) {
  try {
    const baseUrl = `${site.value}`.replace(/\/+$/, '');
    const searchUrl = `${baseUrl}/vodsearch/${encodeURIComponent(queryName)}-------------.html`;
    const searchResponse = await Widget.http.get(searchUrl, { timeout: 10000 });
    const searchItems = extractYy4747SearchItems(getHtmlText(searchResponse), baseUrl)
      .filter(item => {
        const itemInfo = extractSeasonInfo(item.title);
        if (!itemMatchesSearchNames(item.title, candidateNameSet)) return false;
        if (type === 'tv' && itemInfo.seasonNumber !== targetSeason) return false;
        return true;
      })
      .slice(0, 4);

    const detailTasks = searchItems.map(async item => {
      try {
        const detailResponse = await Widget.http.get(item.detailUrl, { timeout: 10000 });
        const playLinks = extractYy4747PlayLinks(getHtmlText(detailResponse), baseUrl, type, targetEpisode);
        const playTasks = playLinks.map(playLink => fetchYy4747PlayResource(site, item, playLink, type));
        const playResults = await Promise.all(playTasks);
        return playResults.filter(Boolean);
      } catch (e) {
        return [];
      }
    });

    const detailResults = await Promise.all(detailTasks);
    return detailResults.flat();
  } catch (e) {
    return [];
  }
}

/**
 * 修改后的提取逻辑：不再直接过滤集数，而是返回带标记的所有集数以便缓存
 */
function extractPlayInfoForCache(item, siteTitle, type) {
  const { vod_name, vod_play_url, vod_play_from, vod_remarks = '' } = item;
  if (!vod_name || !vod_play_url) return [];

  const playSources = vod_play_url.replace(/#+$/, '').split('$$$');
  const sourceNames = (vod_play_from || '').split('$$$');
  
  return playSources.flatMap((playSource, i) => {
    const sourceName = sourceNames[i] || '默认源';
    const isTV = playSource.includes('#');
    const results = [];

    if (type === 'tv' && isTV) {
      const episodes = playSource.split('#').filter(Boolean);
      episodes.forEach(ep => {
        const [epName, url] = ep.split('$');
        if (url && isM3U8Url(url)) {
          const epMatch = epName.match(/第(\d+)集/) || epName.match(/^(\d+)$/);
          results.push({
            name: siteTitle,
            description: `${vod_name} - ${epName}${vod_remarks ? ' - ' + vod_remarks : ''} - [${sourceName}]`,
            url: url.trim(),
            _ep: epMatch ? parseInt(epMatch[1]) : null
          });
        }
      });
    } else if (type === 'movie' && !isTV) {
      const firstM3U8 = playSource.split('#').find(v => isM3U8Url(v.split('$')[1]));
      if (firstM3U8) {
        const [quality, url] = firstM3U8.split('$');
        const qualityText = quality.toLowerCase().includes('tc') ? '抢先版' : '正片';
        results.push({
          name: siteTitle,
          description: `${vod_name} - ${qualityText} - [${sourceName}]`,
          url: url.trim()
        });
      }
    }
    return results;
  });
}

function parseResourceSites(VodData) {
  const parseLine = (line) => {
    const [title, value] = line.split(',').map(s => s.trim());
    if (title && value?.startsWith('http')) {
      return { title, value: value.endsWith('/') ? value : value + '/' };
    }
    return null;
  };
  try {
    const trimmed = VodData?.trim() || "";
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      return JSON.parse(trimmed).map(s => ({ title: s.title || s.name, value: s.url || s.value })).filter(s => s.title && s.value);
    }
    return trimmed.split('\n').map(parseLine).filter(Boolean);
  } catch (e) {
    return RESOURCE_SITES.trim().split('\n').map(parseLine).filter(Boolean);
  }
}

// --- 主入口函数 ---

async function loadResource(params) {
  const {
    seriesName,
    title,
    type = 'tv',
    season,
    episode,
    multiSource,
    VodData
  } = params;

  const tmdbId = getTmdbId(params);
  const inputName = seriesName || title || '';
  if (multiSource !== "enabled" || (!tmdbId && !inputName)) return [];

  const resourceSites = parseResourceSites(VodData);
  const { baseName, seasonNumber } = extractSeasonInfo(inputName);
  const targetSeason = season ? parseInt(season) : seasonNumber;
  const targetEpisode = episode ? parseInt(episode) : null;
  const fallbackNames = [baseName, seriesName, title].filter(Boolean);
  const searchNames = await resolveTmdbSearchNames(tmdbId, type, fallbackNames);
  const candidateNameSet = buildCandidateNameSet(searchNames);
  const cacheIdentity = tmdbId ? `${getMediaType(type)}_${tmdbId}` : normalizeTitleForCompare(baseName);

  // 1. 尝试从缓存获取
  const cacheKey = `vod_exact_cache_${cacheIdentity}_s${targetSeason}_${type}${targetEpisode !== null ? `_e${targetEpisode}` : ''}`;
  let allResources = [];
  
  const cached = await storageGet(cacheKey);
  if (cached && Array.isArray(cached)) {
    console.log(`命中缓存: ${cacheKey}`);
    allResources = cached;
  }

  // 2. 如果没有缓存，则发起网络请求
  if (allResources.length === 0) {
    const queryNames = unique(searchNames.map(name => extractSeasonInfo(name).baseName).filter(Boolean));
    const fetchTasks = resourceSites.flatMap(site => {
      if (isYy4747Site(site)) {
        return queryNames.map(queryName => fetchYy4747Resources(
          site,
          queryName,
          type,
          targetSeason,
          targetEpisode,
          candidateNameSet
        ));
      }

      return queryNames.map(async (queryName) => {
        try {
          const response = await Widget.http.get(site.value, {
            params: { ac: "detail", wd: queryName.trim() },
            timeout: 10000 
          });
          const list = response?.data?.list;
          if (!Array.isArray(list)) return [];

          return list.flatMap(item => {
            const itemInfo = extractSeasonInfo(item.vod_name);
            
            if (!itemMatchesSearchNames(item.vod_name, candidateNameSet)) {
              return [];
            }

            if (type === 'tv' && itemInfo.seasonNumber !== targetSeason) {
              return [];
            }
            
            return extractPlayInfoForCache(item, site.title, type);
          });
        } catch (error) {
          return [];
        }
      });
    });

    const results = await Promise.all(fetchTasks);
    const merged = results.flat();

    // URL 去重
    const urlSet = new Set();
    allResources = merged.filter(res => {
      if (urlSet.has(res.url)) return false;
      urlSet.add(res.url);
      return true;
    });

    // 写入缓存（有效期3小时 = 10800秒）
    if (allResources.length > 0) {
      await storageSet(cacheKey, allResources, 10800);
    }
  }

  // 3. 结果返回：根据 targetEpisode 进行最后的精确过滤
  if (type === 'tv' && targetEpisode !== null) {
    return allResources.filter(res => {
      if (res._ep !== undefined && res._ep !== null) {
        return res._ep === targetEpisode;
      }
      return res.description.includes(`第${targetEpisode}集`) ||
        res.description.includes(`${targetEpisode}$`) ||
        res.description.includes(` ${targetEpisode} `);
    });
  }

  return allResources;
}
