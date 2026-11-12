//昊
const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const appConfig = {
    ver: 1,
    title: '樱花动漫',
    site: 'https://yhdm.one',
    tabs: [
        {
            name: '日本动漫',
            ext: {
                id: 'jp',
            },
        },
        {
            name: '国产动漫',
            ext: {
                id: 'cn',
            },
        },
        {
            name: '欧美动漫',
            ext: {
                id: 'us',
            },
        },{
            name: '其他的',
            ext: {
                id: 'other',
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
    const url =appConfig.site + `/list/?country=${id}&page=${page}` 
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': 'https://yhdm.one/',
            'Origin': 'https://yhdm.one',
        },
    })
    const $ = cheerio.load(data)
    const videos = $('ul.list-unstyled li')
    videos.each((_, e) => {
        const href = $(e).find('a').attr('href')
        const title = $(e).find('h6').text()
        const cover =appConfig.site + $(e).find('img').attr('data-original')
        //const remarks = $(e).find('.note > span').text()
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            //vod_remarks: remarks, // 海報右上角的子標題
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}


//
//

async function getTracks(ext) {
    
    ext = argsify(ext)
   let groups = []
    
    let url = ext.url
    
    

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })


    

    const $ = cheerio.load(data)
    const playlist = $('.ep-panel.mb-3 a')
    for (const e of playlist) {
       
        let name = $(e).attr('title')
        const regex = /\/vod-play\/(.*?)\.html/;

        const ShareUrl = 'https://yhdm.one/_get_plays/' +  $(e).attr('href').match(regex)[1];


        
         let group = {
              title:name ,
              tracks: [],
        }


//后加
        
         const new_data = await $fetch.get(ShareUrl, {
                headers: {
                    'User-Agent': UA,
                      'Referer': 'https://yhdm.one/',
                        'Origin': 'https://yhdm.one',
                },
            });

        const playlists = argsify(new_data.data).video_plays

/*
        

     let  playlists = [
            { "play_data": "https://hd.ijycnd.com/play/9b6589Na/index.m3u8", "src_site": "jyzy" },
            { "play_data": "https://hn.bfvvs.com/play/Le351wpb/index.m3u8", "src_site": "hnzy" },
            { "play_data": "https://play.xluuss.com/play/7e55yLXe/index.m3u8", "src_site": "xlzy" }
        ];


*/
         for (const d of playlists) {
            group.tracks.push({
                name: d.src_site,
                pan: '',
                ext: {
                    url: d.play_data,
                },
            });
        }

        
     

if (group.tracks.length > 0) {
      groups.push(group)
    }





        
    }





    

return jsonify({ list: groups })
      
   
}







async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    return jsonify({ urls: [url] })
}



async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/search?q=${text}`//https://yhdm.one/search?q=%E5%90%8D

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)

    const videos = $('#search_list li')
    videos.each((_, e) => {

        const item = $(e);

        // 提取 href 和 title
        const link = item.find('a').first(); // 找到第一个 <a>
        const href = link.attr('href');



        const img = item.find('img').first(); // 找到第一个 <img>
        
        const cover = img.attr('data-original') || img.attr('src'); // 使用 || 处理优先级

        // 提取图片的 alt 标题
        const title = img.attr('alt');



        
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: appConfig.site + cover,
            vod_remarks: '',

            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })
    return jsonify({
        list: cards,
    })
}
