//昊
//2025-3-21
const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const appConfig = {
    ver: 1,
    title: '追影猫',
    site: 'https://www.weisiwang.com',
    tabs: [
        {
            name: '电影',
            ext: {
                id: '/dianying',
            },
        },
        {
            name: '连续剧',
            ext: {
                id: '/dsj',
            },
        },
        {
            name: '综艺',
            ext: {
                id: '/zongyi',
            },
        },
        {
            name: '动漫',
            ext: {
                id: '/dongman',
            },
        }
    ],
}
async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, id } = ext
    const url = appConfig.site + `/vodshow/${id}--------${page}---.html`
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })
    const $ = cheerio.load(data)
    $("a.module-poster-item.module-item").each((index, e) => {
        const href = $(e).attr('href') || ''
        const title = $(e).attr('title') || ''
        const img = $(e).find('img.lazy.lazyload').attr('data-original') || ''

        const remarks = $(e).find('div.module-item-note').text().trim() || ''
        if (img) {

            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: img,
                vod_remarks: remarks,
                ext: {
                    url: `${appConfig.site}${href}`,
                },

            })
        }

    })

    //$utils.toastError(jsonify(cards))
    return jsonify({
        list: cards,
    })
}


async function getTracks(ext) {

    ext = argsify(ext)
    let groups = []

    let url = ext.url
   // $utils.toastError(jsonify(url))
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })




    const $ = cheerio.load(data)


    const line_list = []
    const line_change = $('div#y-playList').find("div.module-tab-item.tab-item")


    line_change.each((index, el) => {


        line_list.push($(el).attr("data-dropdown-value"))

    })


    $('div.module-play-list').each((num, el) => {

        let group = {
            title: `${line_list[num]}`,
            tracks: [],
        };

        const void_list = $('a.module-play-list-link');

        void_list.each((index, e) => {

            const href = $(e).attr('href')

            const pattern = /\/vodplay\/\d+-(\d+)-\d+\.html/;
            //线路名称与真实线路没匹配 问题不大埋点
            const matches = parseFloat(href.match(pattern)[1]);

            if (num + 1 === matches) {

                group.tracks.push({
                    name: `${$(e).text()}`,
                    pan: '',
                    ext: {
                        url: `${appConfig.site}${href}`,
                    },
                });
            }
        })

        if (group.tracks.length > 0) {
            groups.push(group);
        }

    })
    return jsonify({ list: groups })
}


async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    //$utils.toastError(jsonify(data))

    const $ = cheerio.load(data);


    const scriptContent = $('script:contains("player_aaaa")').text()


    eval(scriptContent)
    let url_id = player_aaaa.url

    //$utils.toastError(jsonify(url_id));

    return jsonify({ urls: [url_id] })
}



async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/vodsearch${text}/page/${page}.html`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)

    $("div.module-card-item.module-item").each((index, e) => {
        console.log(index)

        const href = $(e).find('a.module-card-item-poster').attr('href') || ''
        const title = $(e).find('img.lazy.lazyload').attr("alt") || ''
        const img = $(e).find('img.lazy.lazyload').attr('data-original') || ''

        const remarks = $(e).find('div.module-item-note').text().trim() || ''

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: img,
            vod_remarks: remarks,
            ext: {
                url: `${appConfig.site}${href}`,
            },

        })


    })
    return jsonify({
        list: cards,
    })
}



