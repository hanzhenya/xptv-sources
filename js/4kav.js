// tv

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 1,
    title: '4k-av',
    site: 'https://4kmp.com',
    tabs: [
        {
            name: '首頁',
            ext: {
                id: 0,
                url: 'https://4kmp.com',
            },
        },
        {
            name: '電影',
            ext: {
                id: 1,
                url: 'https://4kmp.com/movie',
            },
        },
        {
            name: '電視劇',
            ext: {
                id: 2,
                url: 'https://4kmp.com/tv',
            },
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    // 頁數寫入cache
    var lastPage = {
        0: 1,
        1: 1,
        2: 1,
    }
    let val = $cache.get('av')
    if (val) {
        lastPage = JSON.parse(val)
    }

    let cards = []
    let { id, page = 1, url } = ext

    if (page > 1) {
        url += `/page-${lastPage[id] - page + 1}.html`
    }

    $print(`url: ${url}`)

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const elems = $html.elements(data, '#MainContent_newestlist .virow .NTMitem')
    elems.forEach((element) => {
        const href = $html.attr(element, '.title a', 'href')
        const title = $html.text(element, '.title h2')
        const cover = $html.attr(element, '.poster img', 'src')
        const subTitle = $html.text(element, 'label[title=分辨率]').split('/')[0]
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    // get lastpage
    if (page == 1) {
        const pageNumber = $html.text(data, '#MainContent_header_nav .page-number')
        const num = pageNumber.split('/')[1]
        lastPage[id] = num
        const jsonData = JSON.stringify(lastPage, null, 2)
        $cache.set('av', jsonData)
    }

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    // 檢查是不是多集
    let playlist = $html.elements(data, '#rtlist li')
    if (playlist.length > 0) {
        playlist.forEach((element) => {
            let name = $html.text(element, 'span') || '播放'
            // 2026-11 加固: img[src] 缺失時原本會對 undefined 調用 replace 而拋異常
            const src = $html.attr(element, 'img', 'src')
            if (!src) return
            let epUrl = src.replace('screenshot.jpg', '')
            tracks.push({
                name: name,
                pan: '',
                ext: {
                    url: epUrl,
                },
            })
        })
    }
    if (tracks.length === 0) {
        // 單集或播放列表改版時,回退詳情頁(getPlayinfo 可從詳情頁取播放地址)
        tracks.push({
            name: '播放',
            pan: '',
            ext: {
                url,
            },
        })
    }

    return jsonify({
        list: [
            {
                title: '默认分组',
                tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const pageUrl = ext.url
    if (!pageUrl) return jsonify({ urls: [] })
    let url = pageUrl.replace('www.', '')

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    // 2026-11 加固: 播放地址為空時兜底抓頁面內的 m3u8/mp4,並補全相對地址
    let playUrl = $html.attr(data, '#MainContent_videowindow video source', 'src')
    if (!playUrl) {
        const m = String(data || '').match(/https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/i)
        if (m) playUrl = m[0]
    }
    if (!playUrl) return jsonify({ urls: [] })
    try { playUrl = new URL(playUrl, url).href } catch (e) { return jsonify({ urls: [] }) }

    return jsonify({ urls: [playUrl], headers: [{ 'User-Agent': UA }] })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let url = appConfig.site + `/s?q=${text}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const elems = $html.elements(data, '#MainContent_newestlist .virow .NTMitem')
    elems.forEach((element) => {
        const href = $html.attr(element, '.title a', 'href')
        const title = $html.text(element, '.title h2')
        const cover = $html.attr(element, '.poster img', 'src')
        const subTitle = $html.text(element, 'label[title=分辨率]').split('/')[0]
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}
