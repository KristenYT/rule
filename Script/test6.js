// ================================
// Cineby Full Playable Module
// Fully Fixed Version
// ================================

const DEFAULT_CINEBY_HOST =
  "https://www.cineby.sc";

const VIDEO_SOURCE_API =
  "https://api.videasy.net/downloader2/sources-with-title";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: DEFAULT_CINEBY_HOST,
  Origin: DEFAULT_CINEBY_HOST,
  Accept: "application/json,text/plain,*/*"
};

// ================================
// HTTP
// ================================

async function request(url, headers = {}) {

  const response =
    await Widget.http.get(url, {
      headers: {
        ...DEFAULT_HEADERS,
        ...headers
      }
    });

  return response.data;
}

// ================================
// SEARCH
// ================================

async function searchCineby(params = {}) {

  const keyword =
    params.keyword || "";

  if (!keyword) {
    return [];
  }

  const url =
    `${DEFAULT_CINEBY_HOST}/search?q=${encodeURIComponent(keyword)}`;

  const html =
    await request(url);

  const match =
    html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );

  if (!match) {
    return [];
  }

  const json =
    JSON.parse(match[1]);

  const raw =
    JSON.stringify(json);

  const regex =
    /"title":"(.*?)".*?"slug":"(.*?)".*?"poster":"(.*?)"/g;

  let m;

  const results = [];

  while (
    (m = regex.exec(raw))
    !== null
  ) {

    const slug =
      m[2];

    const tmdbId =
      slug.match(/(\d+)/)?.[1];

    results.push({

      id: slug,

      tmdbId,

      type: "url",

      title: m[1],

      posterPath: m[3],

      backdropPath: m[3],

      link:
        DEFAULT_CINEBY_HOST +
        slug
    });
  }

  return results;
}

// ================================
// SHA512
// ================================

function _sha512Hex(input) {

  return CryptoJS
    .SHA512(String(input))
    .toString(CryptoJS.enc.Hex);
}

// ================================
// KEY GENERATION
// ================================

function _c7(input) {

  const xorKey =
    "8c465aa8af6cbfd4c1f91bf0c8d678ba";

  return String(input)
    .split("")
    .map((ch) => {

      let v =
        ch.charCodeAt(0);

      for (
        let i = 0;
        i < xorKey.length;
        i++
      ) {

        v ^=
          xorKey.charCodeAt(i);
      }

      return (
        "0" +
        Number(v).toString(16)
      ).substr(-2);
    })
    .join("");
}

// ================================
// RC4
// ================================

function _wasmRc4Init(key) {

  const S = new Array(256);

  for (let i = 0; i < 256; i++) {
    S[i] = i;
  }

  let j = 0;

  key = String(key);

  for (let i = 0; i < 256; i++) {

    j = (
      S[i] +
      j +
      key.charCodeAt(
        i % key.length
      )
    ) % 256;

    const tmp = S[i];

    S[i] = S[j];

    S[j] = tmp;
  }

  return {
    S,
    i: 0,
    j: 0,
    value: 0
  };
}

function _wasmRc4Next(state) {

  const S = state.S;

  let i = state.i;

  let j =
    (
      S[i] +
      state.j
    ) % 256;

  const tmp = S[i];

  S[i] = S[j];

  S[j] = tmp;

  i = (i + 1) % 256;

  state.i = i;

  state.j = j;

  state.value =
    S[
      (
        S[j] +
        S[i]
      ) % 256
    ];

  return state.value;
}

function _wasmRc4ToHex(key, plain) {

  const state =
    _wasmRc4Init(key);

  _wasmRc4Next(state);

  let out = "";

  for (
    let i = 0;
    i < plain.length;
    i++
  ) {

    const b =
      (
        plain.charCodeAt(i) ^
        state.value
      ) & 255;

    out +=
      (
        "0" +
        b.toString(16)
      ).substr(-2);

    _wasmRc4Next(state);
  }

  return out;
}

function _wasmRc4FromHex(key, hex) {

  const state =
    _wasmRc4Init(key);

  _wasmRc4Next(state);

  let out = "";

  for (
    let i = 0;
    i < hex.length;
    i += 2
  ) {

    const b =
      parseInt(
        hex.substr(i, 2),
        16
      );

    out +=
      String.fromCharCode(
        (
          b ^
          state.value
        ) & 255
      );

    _wasmRc4Next(state);
  }

  return out;
}

// ================================
// WASM DECRYPT
// ================================

function wasmDecrypt(
  encrypted,
  tmdbId
) {

  const fixedKey =
    "Hello Reverse Engineers! 👋 - Ciarán";

  let seed =
    Number(tmdbId);

  const bytes = [];

  for (
    let i = 0;
    i < 50;
    i++
  ) {

    seed =
      (
        seed *
        1103515245 +
        12345
      ) % 2147483648;

    bytes.push(
      Math.trunc(seed % 255) & 255
    );
  }

  const joined =
    bytes.join(",");

  const shaKey =
    _sha512Hex(joined);

  const rc4KeyHex =
    _wasmRc4ToHex(
      fixedKey,
      shaKey
    );

  return _wasmRc4FromHex(
    rc4KeyHex,
    String(encrypted)
  );
}

// ================================
// FINAL DECRYPT
// ================================

function finalDecrypt(
  encrypted,
  tmdbId
) {

  const aesPayload =
    wasmDecrypt(
      encrypted,
      tmdbId
    );

  const aesKey =
    _c7(
      String(tmdbId) +
      "d486ae1ce6fdbe63b60bd1704541fcf0"
    );

  const decrypted =
    CryptoJS.AES.decrypt(
      String(aesPayload),
      String(aesKey)
    ).toString(
      CryptoJS.enc.Utf8
    );

  return JSON.parse(decrypted);
}

// ================================
// VIDEO SOURCE
// ================================

async function loadVideoSource(
  tmdbId,
  mediaType,
  title,
  imdbId,
  season,
  episode
) {

  const params =
    new URLSearchParams({

      title: title,

      mediaType: mediaType,

      tmdbId: String(tmdbId)
    });

  if (imdbId) {

    params.append(
      "imdbId",
      imdbId
    );
  }

  if (mediaType === "tv") {

    params.append(
      "seasonId",
      String(season || 1)
    );

    params.append(
      "episodeId",
      String(episode || 1)
    );
  }

  const encrypted =
    await request(
      VIDEO_SOURCE_API +
      "?" +
      params.toString()
    );

  if (!encrypted) {

    throw new Error(
      "Videasy response empty"
    );
  }

  return finalDecrypt(
    encrypted,
    tmdbId
  );
}

// ================================
// MAIN RESOURCE
// ================================

async function loadResource(params) {

  params = params || {};

  const keyword =
    (
      params.title ||
      params.keyword ||
      params.name ||
      ""
    ).trim();

  if (!keyword) {
    return [];
  }

  const type =
    params.type === "movie"
      ? "movie"
      : "tv";

  const season =
    parseInt(params.season || 1);

  const episode =
    parseInt(params.episode || 1);

  const searchResults =
    await searchCineby({
      keyword
    });

  if (
    !searchResults ||
    searchResults.length === 0
  ) {

    return [];
  }

  const best =
    searchResults[0];

  const tmdbId =
    best.tmdbId;

  if (!tmdbId) {
    return [];
  }

  try {

    const sourceData =
      await loadVideoSource(
        tmdbId,
        type,
        best.title,
        null,
        season,
        episode
      );

    if (
      !sourceData ||
      !sourceData.sources ||
      sourceData.sources.length === 0
    ) {

      return [];
    }

    const source =
      sourceData.sources[0];

    return [{

      id:
        "cineby_" +
        tmdbId,

      type: "url",

      title:
        best.title,

      name:
        best.title,

      posterPath:
        best.posterPath,

      backdropPath:
        best.backdropPath,

      mediaType:
        type,

      videoUrl:
        source.file ||
        source.url ||
        "",

      playerType:
        "hls",

      headers: {

        Referer:
          DEFAULT_CINEBY_HOST,

        Origin:
          DEFAULT_CINEBY_HOST
      },

      subtitles:
        (
          sourceData.subtitles || []
        ).map(v => ({

          title:
            v.label ||
            v.lang ||
            "字幕",

          url:
            v.file ||
            v.url ||
            ""
        }))
    }];

  } catch (e) {

    console.log(
      "Cineby loadResource error",
      e
    );

    return [];
  }
}
