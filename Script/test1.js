// ============================================
// Cineby ForwardWidgets Module
// Full Playable Final Version
// ============================================

var WidgetMetadata = {
    id: "cineby.playable.final",
    title: "Cineby",
    description: "Cineby Playable Module",
    author: "ChatGPT",
    version: "1.0.0",
    requiredVersion: "0.0.1"
};

var BASE_URL =
    "https://www.cineby.sc";

var SEARCH_API =
    "https://db.videasy.net/3/search/multi";

var SOURCE_API =
    "https://api.videasy.net/downloader2/sources-with-title";

// ============================================
// HTTP
// ============================================

async function httpGet(url, headers) {

    headers = headers || {};

    var response =
        await Widget.http.get(url, {
            headers: headers
        });

    return response.data;
}

// ============================================
// SEARCH
// ============================================

async function searchCineby(params) {

    params = params || {};

    var keyword =
        params.keyword ||
        params.wd ||
        "";

    if (!keyword) {
        return [];
    }

    var url =
        SEARCH_API +
        "?language=en&page=1&query=" +
        encodeURIComponent(keyword);

    var json =
        await httpGet(url, {
            Accept: "application/json"
        });

    if (
        !json ||
        !json.results
    ) {
        return [];
    }

    return json.results
        .filter(function(v) {

            return (
                v.media_type === "movie" ||
                v.media_type === "tv"
            );
        })
        .map(function(v) {

            return {

                id:
                    String(v.id),

                tmdbId:
                    String(v.id),

                title:
                    v.title ||
                    v.name ||
                    "",

                type:
                    v.media_type,

                posterPath:
                    v.poster_path
                        ? "https://image.tmdb.org/t/p/w500" +
                          v.poster_path
                        : "",

                backdropPath:
                    v.backdrop_path
                        ? "https://image.tmdb.org/t/p/original" +
                          v.backdrop_path
                        : "",

                description:
                    v.overview ||
                    "",

                releaseDate:
                    v.release_date ||
                    v.first_air_date ||
                    ""
            };
        });
}

// ============================================
// SHA512
// ============================================

function _sha512Hex(input) {

    return CryptoJS
        .SHA512(String(input))
        .toString(CryptoJS.enc.Hex);
}

// ============================================
// KEY GENERATION
// ============================================

function _c7(input) {

    var xorKey =
        "8c465aa8af6cbfd4c1f91bf0c8d678ba";

    return String(input)
        .split("")
        .map(function(ch) {

            var v =
                ch.charCodeAt(0);

            for (
                var i = 0;
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

// ============================================
// RC4
// ============================================

function _wasmRc4Init(key) {

    var S = [];

    for (var i = 0; i < 256; i++) {
        S[i] = i;
    }

    var j = 0;

    key = String(key);

    for (i = 0; i < 256; i++) {

        j = (
            S[i] +
            j +
            key.charCodeAt(i % key.length)
        ) % 256;

        var tmp = S[i];

        S[i] = S[j];

        S[j] = tmp;
    }

    return {
        S: S,
        i: 0,
        j: 0,
        value: 0
    };
}

function _wasmRc4Next(state) {

    var S = state.S;

    var i = state.i;

    var j =
        (S[i] + state.j) % 256;

    var tmp = S[i];

    S[i] = S[j];

    S[j] = tmp;

    i = (i + 1) % 256;

    state.i = i;

    state.j = j;

    state.value =
        S[(S[j] + S[i]) % 256];

    return state.value;
}

function _wasmRc4ToHex(key, plain) {

    var state =
        _wasmRc4Init(key);

    _wasmRc4Next(state);

    var out = "";

    for (
        var i = 0;
        i < plain.length;
        i++
    ) {

        var b =
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

    var state =
        _wasmRc4Init(key);

    _wasmRc4Next(state);

    var out = "";

    for (
        var i = 0;
        i < hex.length;
        i += 2
    ) {

        var b =
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

// ============================================
// WASM DECRYPT
// ============================================

function wasmDecrypt(
    encrypted,
    tmdbId
) {

    var fixedKey =
        "Hello Reverse Engineers! 👋 - Ciarán";

    var seed =
        Number(tmdbId);

    var bytes = [];

    for (var i = 0; i < 50; i++) {

        seed = (
            seed * 1103515245 +
            12345
        ) % 2147483648;

        bytes.push(
            Math.trunc(seed % 255) & 255
        );
    }

    var joined =
        bytes.join(",");

    var shaKey =
        _sha512Hex(joined);

    var rc4KeyHex =
        _wasmRc4ToHex(
            fixedKey,
            shaKey
        );

    return _wasmRc4FromHex(
        rc4KeyHex,
        String(encrypted)
    );
}

// ============================================
// FINAL DECRYPT
// ============================================

function finalDecrypt(
    encrypted,
    tmdbId
) {

    var aesPayload =
        wasmDecrypt(
            encrypted,
            tmdbId
        );

    var aesKey =
        _c7(
            String(tmdbId) +
            "d486ae1ce6fdbe63b60bd1704541fcf0"
        );

    var decrypted =
        CryptoJS.AES.decrypt(
            String(aesPayload),
            String(aesKey)
        ).toString(
            CryptoJS.enc.Utf8
        );

    return JSON.parse(decrypted);
}

// ============================================
// VIDEO SOURCE
// ============================================

async function loadVideoSource(
    tmdbId,
    mediaType,
    title,
    season,
    episode
) {

    var params =
        new URLSearchParams({
            title: title,
            mediaType: mediaType,
            tmdbId: String(tmdbId)
        });

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

    var encrypted =
        await httpGet(
            SOURCE_API +
            "?" +
            params.toString(),
            {
                Referer: BASE_URL,
                Origin: BASE_URL,
                Accept: "application/json,text/plain,*/*"
            }
        );

    if (!encrypted) {
        return null;
    }

    return finalDecrypt(
        encrypted,
        tmdbId
    );
}

// ============================================
// MAIN
// ============================================

async function loadResource(params) {

    params = params || {};

    var keyword =
        params.title ||
        params.keyword ||
        params.name ||
        params.wd ||
        "";

    if (!keyword) {
        return [];
    }

    var type =
        params.type === "movie"
            ? "movie"
            : "tv";

    var season =
        parseInt(
            params.season || 1
        );

    var episode =
        parseInt(
            params.episode || 1
        );

    var searchResults =
        await searchCineby({
            keyword: keyword
        });

    if (
        !searchResults ||
        searchResults.length === 0
    ) {
        return [];
    }

    var best =
        searchResults[0];

    var sourceData =
        await loadVideoSource(
            best.tmdbId,
            type,
            best.title,
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

    var source =
        sourceData.sources[0];

    return [{

        id:
            "cineby_" +
            best.tmdbId,

        type: "url",

        title:
            best.title,

        name:
            best.title,

        posterPath:
            best.posterPath,

        backdropPath:
            best.backdropPath,

        description:
            best.description,

        releaseDate:
            best.releaseDate,

        mediaType:
            type,

        videoUrl:
            source.file ||
            source.url ||
            "",

        playerType:
            "hls",

        headers: {
            Referer: BASE_URL,
            Origin: BASE_URL
        },

        subtitles:
            (
                sourceData.subtitles || []
            ).map(function(v) {

                return {
                    title:
                        v.label ||
                        v.lang ||
                        "字幕",

                    url:
                        v.file ||
                        v.url ||
                        ""
                };
            })
    }];
}
