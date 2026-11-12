const cheerio = createCheerio()

let UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

let appConfig = {
    ver: 20251206,
    title: 'anime1',
    site: 'https://anime1.me',
    tabs: [
        {
            id: '1',
            name: 'list',
            ext: {},
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1 } = ext

    if (page > 1) return
    try {
        const url = appConfig.site + `/animelist.json`
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        argsify(data).forEach((e) => {
            cards.push({
                vod_id: `${e[0]}`,
                vod_name: e[1],
                vod_pic: '',
                vod_remarks: e[2] || '',
                vod_pubdate: e[3] || '',
                ext: {
                    id: `${e[0]}`,
                },
            })
        })

        return jsonify({
            list: cards,
        })
    } catch (error) {
        $print(error)
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let { id, href } = ext
    let url = href ? href : appConfig.site + `/?cat=${id}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)
    $('#main > article').each((_, e) => {
        let name = $(e).find('.entry-title a').text()
        let href = $(e).find('.entry-title a').attr('href')

        tracks.push({
            name,
            pan: '',
            ext: {
                href,
            },
        })
    })

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
    let { href } = ext
    let api = 'https://v.anime1.me/api'
    try {
        // 修正原代码 User-Anent 拼写错误
        const { data } = await $fetch.get(href, {
            headers: { 'User-Agent': UA },
        })
        const $ = cheerio.load(data)
        const apireq = $('.vjscontainer > video').attr('data-apireq')
        if (!apireq) return jsonify({ urls: [] })

        const apires = await $fetch.post(api, `d=${apireq}`, {
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })

        const payload = argsify(apires.data)
        const playUrl = payload?.s?.[0]?.src
        if (!playUrl) return jsonify({ urls: [] })

        // 2026-11 修复: API 会下发 3 个 set-cookie 作为防盗链签名(实测不带 Cookie 返回 403)。
        // 原实现只认大写 'Set-Cookie'、且用 split(',') 粗暴切分:
        //   - 键名大小写不符时直接抛异常被 catch 吞掉 → 返回空地址
        //   - expires=Thu, 12 Nov ... 里的逗号会把 cookie 切碎
        // 改为兼容大小写/数组/合并字符串,并按「逗号后紧跟 key=」分割。
        const rh = apires.respHeaders || {}
        let raw = rh['Set-Cookie'] || rh['set-cookie'] || ''
        if (!raw && apires.headers && typeof apires.headers.getSetCookie === 'function') {
            raw = apires.headers.getSetCookie()
        }
        const parts = Array.isArray(raw) ? raw : String(raw || '').split(/,\s*(?=[A-Za-z0-9_-]+=)/)
        let cookie = ''
        parts.forEach((e) => {
            const kv = String(e || '').split(';')[0].trim()
            if (kv) cookie += `${kv}; `
        })

        const url = playUrl.startsWith('http') ? playUrl : 'https:' + playUrl
        return jsonify({
            urls: [url],
            headers: [{ 'User-Agent': UA, Cookie: cookie, Referer: 'https://anime1.me/' }],
        })
    } catch (error) {
        $print(error)
        return jsonify({ urls: [] })
    }
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    const text = encodeURIComponent(ext.text)
    const page = ext.page || 1
    const url = `${appConfig.site}/page/${page}?s=${text}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    try {
        const $ = cheerio.load(data)
        $('#main > article').each((_, e) => {
            let name = $(e).find('.entry-footer .cat-links a').text()
            let href = $(e).find('.entry-footer .cat-links a').attr('href')

            if (!name || !href) return
            cards.push({
                vod_id: href,
                vod_name: name,
                vod_pic: '',
                ext: {
                    href,
                },
            })
        })
    } catch (error) {
        console.log(error)
    }

    return jsonify({
        list: cards,
    })
}
