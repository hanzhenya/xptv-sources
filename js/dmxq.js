//昊
const cheerio = createCheerio()

// 預先定義請求使用的 user-agent
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const appConfig = {
    ver: 1,
    title: '大米星球|昊',
    site: 'https://dmxq24.com',
    tabs: [
        {
            name: '电影',
            ext: {
                id: 1,
            },
        },
        {
            name: '电视剧',
            ext: {
                id: 2,
            },
        },
        {
            name: '综艺',
            ext: {
                id: 3,
            },
        },
        {
            name: '动漫',
            ext: {
                id: 4,
            },
        },
    ],
}
async function getConfig() {
    return jsonify(appConfig)
}
async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, id } = ext
    //id = encodeURIComponent(id)

    const url = appConfig.site + `/dmvodshow/${id}--------${page}---.html`
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })
    const $ = cheerio.load(data)

    const videos = $('ul.fed-list-info.fed-part-dmx1102-rows li')
    videos.each((_, e) => {
        const href = $(e).find('a.fed-list-title').attr('href');  
        const title = $(e).find('a.fed-list-title').text().trim()
        const cover = $(e).find('a.fed-list-pics').attr('data-original');
        const remarks = $(e).find('span.fed-list-remarks').text().trim(); 

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
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



async function getTracks(ext) {
    ext = argsify(ext);

    let groups = [];
    let url = ext.url;


    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    });
    const $ = cheerio.load(data);

    const lines = [];
    $('ul.fed-dmx1102-padding').first().find('li a').each((_, el) => {  
        const lineText = $(el).text().trim(); // 获取文本并去除前后空白
        lines.push(lineText);
    });

   // $utils.toastError(jsonify(lines));
    const ulElements = $('.fed-tabs-dmx1102-foot ul.fed-tabs-dmx1102-btm');
    for (let i = 0; i < lines.length; i++) {
        const ul = ulElements[i];

        let group = {
            title: lines[i], 
            tracks: [],         
        };

        const linkElements = $(ul).find('li a');

        for (let j = 0; j < linkElements.length; j++) {
            const link = linkElements[j];

            group.tracks.push({
                name: $(link).text().trim(),
                pan: '',
                ext: {
                    url: appConfig.site + $(link).attr('href'),
                },
            });
        }
 
        if (group.tracks.length > 0) {
            groups.push(group);
        }
    }


    return jsonify({ list: groups });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let url = ext.url;
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    });
    const $ = cheerio.load(data);


const scriptContent = $('script:contains("player_aaaa")').text()
              


   eval(scriptContent)
   const url_id= player_aaaa.url

 //$utils.toastError(jsonify( url_id));

	return jsonify({ urls: [url_id] })
}





async function search(ext) {
	ext = argsify(ext)
	let cards = []

	let text = encodeURIComponent(ext.text)
	let page = ext.page || 1
	let url = `${appConfig.site}/dmvodsearch/${text}----------${page}---.html`

	const { data } = await $fetch.get(url, {
		headers: {
			'User-Agent': UA,
		},
	})

const $ = cheerio.load(data);


    const videos = $('dl.fed-list-deta')
    videos.each((_, e) => {
        const href = $(e).find('h3.fed-part-dmx1102-eone a').attr('href');  
        const title = $(e).find('h3.fed-part-dmx1102-eone a').text().trim();

        const cover = $(e).find('a.fed-list-pics').attr('data-original');
        const remarks = $(e).find('span.fed-list-remarks').text().trim();
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: remarks,
            ext: {
                url: `${appConfig.site}/dmvoddetail/${href.match(/(\d+)(?=-)/)[1]}.html`,
            },
        })
    })


	
	return jsonify({
		list: cards,
	})
}


