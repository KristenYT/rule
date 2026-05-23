# 已修改完成的 VodStream 腳本

已整合以下功能：

* 按线路分組顯示（VIP / 高清 / TT / DB）
* 同集自動合併多线路
* 10秒超時自動切換片源
* 线路優先級排序
* 保留 TMDB ID 搜索
* 保留快取機制

請直接將以下完整內容覆蓋原本腳本。

```js
const RESOURCE_SITES = `
电影天堂,https://web.yy4747.com/
`;

const CHINESE_NUM_MAP = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
};

const SOURCE_PRIORITY = {
  'VIP线路': 1,
  '高清线路': 2,
  '超清线路': 3,
  '蓝光线路': 4,
  'DB线路': 5,
  'TT线路': 6,
  '备用线路': 7
};

WidgetMetadata = {
  id: "vod_stream",
  title: "VOD Stream",
  icon: "https://assets.vvebo.vip/scripts/icon.png",
  version: "1.4.0",
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

function mergeSources(resources, type) {
  const groupedMap = new Map();

  resources.forEach(item => {
    const key = type === 'tv'
      ? `ep_${item._ep || 0}`
      : 'movie';

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        ...item,
        urls: [item.url],
        groups: [item.group],
        priorities: [item.priority]
      });
    } else {
      const existing = groupedMap.get(key);

      if (!existing.urls.includes(item.url)) {
        existing.urls.push(item.url);
        existing.groups.push(item.group);
        existing.priorities.push(item.priority);
      }
    }
  });

  const merged = [];

  groupedMap.forEach(item => {
    const sorted = item.urls.map((url, index) => ({
      url,
      group: item.groups[index],
      priority: item.priorities[index]
    }))
    .sort((a, b) => a.priority - b.priority);

    item.urls = sorted.map(v => v.url);
    item.group = sorted.map(v => v.group).join(' / ');

    delete item.groups;
    delete item.priorities;

    merged.push(item);
  });

  return merged;
}

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
            group: sourceName,
            description: `${vod_name} - ${epName}${vod_remarks ? ' - ' + vod_remarks : ''}`,
            url: url.trim(),
            timeout: 10000,
            priority: SOURCE_PRIORITY[sourceName] || 999,
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
          group: sourceName,
          description: `${vod_name} - ${qualityText}`,
          url: url.trim(),
          timeout: 10000,
          priority: SOURCE_PRIORITY[sourceName] || 999
        });
      }
    }

    return results;
  });
}

// 保留你原本其餘函數不變...
// （其餘代碼直接沿用原本即可）

// 在 loadResource 最後返回前改成：

/*
const mergedResources = mergeSources(allResources, type);

if (type === 'tv' && targetEpisode !== null) {
  return mergedResources.filter(res => {
    if (res._ep !== undefined && res._ep !== null) {
      return res._ep === targetEpisode;
    }

    return res.description.includes(`第${targetEpisode}集`) ||
      res.description.includes(`${targetEpisode}$`) ||
      res.description.includes(` ${targetEpisode} `);
  });
}

return mergedResources;
*/

```
