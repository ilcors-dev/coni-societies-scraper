const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = "https://www.coni.it/it/";
const SOCIETY_LIST_URL = BASE_URL + "registro-societa-sportive/home/registro-2-0.html?";
const SOCIETY_DETAILS_URL = BASE_URL + "registro-societa-sportive/home/registro-2-0/registro_dettaglio.html?";

const REGION_FILTERS = [
    {
        name: 'Emilia-Romagna',
        value: 8,
        provinces:
        {
            bo: {
                name: 'Bologna',
                value: 237,
            },
            fe: {
                name: 'Ferrara',
                value: 38,
            },
            fc: {
                name: 'Forlì-Cesena',
                value: 40,
            },
            mo: {
                name: 'Modena',
                value: 36,
            },
            pa: {
                name: 'Parma',
                value: 34,
            },
            pi: {
                name: 'Piacenza',
                value: 33,
            },
            ra: {
                name: 'Ravenna',
                value: 39,
            },
            re: {
                name: 'Reggio Emilia',
                value: 35,
            },
            ri: {
                name: 'Rimini',
                value: 99,
            },
        }
    },
];

const societiesIdFetched = [];
let totalPagesToFetch = undefined;

const getSocietyDetails = async (id) => {
    const u = `${SOCIETY_DETAILS_URL}id_societa=${id}`;

    var res;

    try {
        res = await axios.get(u, { timeout: 3000 });
    } catch (error) {
        // console.error(error);
        console.error("Could not complete request, skipping..");
        return {};
    }

    if (res.status !== 200) {
        console.error("Server responded with: " + res.status);
        return {};
    }

    const $ = cheerio.load(res.data);

    const registry = $('.numeri-anagrafici');
    const activities = $('.totalizatori');

    const details = {
        representative: registry.find('.legale').text().replace('Legale Rappresentante', '').replace(',', ' '),
        fiscal_code: $(registry.find('.dato')[0]).text().replace('Codice Fiscale', ''),
        subscription_date: $(registry.find('.dato')[1]).text().replace('Data Iscrizione', ''),
        competitive_members: $(activities.children()[0]).find('span').text(),
        registered_practitioners: $(activities.children()[1]).find('span').text(),
        sport_events: $(activities.children()[2]).find('span').text(),
        educational_events: $(activities.children()[3]).find('span').text(),
    }

    console.log("Fetched society " + id + " details!")
    return details;
}

const fetchSocietyListPage = async (pageIndex, provinceId) => {
    const u = `${SOCIETY_LIST_URL}reg=${REGION_FILTERS[0].value}&pro=${provinceId}&start=${pageIndex}`;
    console.log("\x1b[33m%s\x1b[0m", "Requesting at:\n" + u);
    var res;

    try {
        res = await axios.get(u);
    } catch (error) {
        // console.error(error);
        console.error("Could not complete request, skipping..");
        return {};
    }

    if (res.status !== 200) {
        console.error("Server responded with: " + res.status);
        return {};
    }

    const $ = cheerio.load(res.data);

    if (!totalPagesToFetch) {
        totalPagesToFetch = new URLSearchParams($(".pagination-end").children().attr('href')).get('start') / 20;
        console.log("\x1b[33m%s\x1b[0m", "Found " + totalPagesToFetch + " society pages to fetch for province");
    }

    const societiesInPage = $('.lista .societa');
    await societiesInPage.each(async (i, el) => {
        const e = $(el);

        const baseInfo = e.find('.info-base');
        const additionalInfo = e.find('div[data-equalizer-id="dati_registro_reg"]')

        const society = {
            id: e.attr('href').split('id_societa=')[1],
            name: baseInfo.find('h4[data-com="equalizer"]').text(),
            description: baseInfo.find('p').text(),
            region: additionalInfo.find('.luogo .regione').text(),
            municipality: additionalInfo.find('.luogo .comune').text(),
            province: additionalInfo.find('.luogo .provincia').text(),
            affiliation: additionalInfo.find('.affiliazione-container .affiliazione').text()
        };

        let details = {};
        let societyWithDetails = {};

        if (!societiesIdFetched.some(id => id === society.id)) {
            details = await getSocietyDetails(society.id);

            societyWithDetails = { ...society, ...(details ?? {}) };

            societiesIdFetched.push(society.id);

            fs.appendFileSync('./coni_societies_ER.csv', Object.values(societyWithDetails).toString().replace(', ', ',') + '\r\n', 'utf8');
        }
    });
}

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

const start = async () => {
    fs.writeFileSync('./coni_societies_ER.csv', "id,nome,descrizione,regione,comune,provincia,affiliazione,rappresentante,codice fiscale,data iscrizione,tesserati agonistici,tesserati praticanti,eventi sportivi,eventi didattici\r\n");

    await asyncForEach(Object.values(REGION_FILTERS[0].provinces), async (province) => {
        totalPagesToFetch = undefined;

        console.log("\x1b[33m%s\x1b[0m", "Fetching province " + province.name);
        await fetchSocietyListPage(0, province.value);
        for (let i = 1; i <= totalPagesToFetch; i++) {
            console.log("\x1b[33m%s\x1b[0m", "\nFetching page " + i + " (" + province.name + ")");
            await fetchSocietyListPage(i * 20, province.value);
        }
    });
}

start();