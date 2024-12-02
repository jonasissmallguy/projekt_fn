import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

//loader .env filen - vores enviorement variables - anvender vores dotenv biblotek (import)
dotenv.config();

//logger, "forbinder til vores database og databasens envirorement variabele (.env)
//process.env (node.js) bruges til at tilgå vores enviorement variables. 
console.log('Connecting to database', process.env.PG_DATABASE);


//laver variablen db (forbindelse til pg) - anvender vores pg biblotek (import) 
const db = new pg.Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: process.env.PG_REQUIRE_SSL ? {
        rejectUnauthorized: false,
    } : undefined,
});

//laver dbResult variabel, som er en forespørgsel til vores db om tidspunkt
const dbResult = await db.query('select now()');
console.log('Database connection established on', dbResult.rows[0].now);

//
const port = process.env.PORT || 3000;
const server = express();

server.use(express.static('frontend'));
server.use(onEachRequest);
//server.get('/api/countries', onGetCountries);
server.listen(port, onServerReady);


/*async function onGetCountries(request, response) {
    const dbResult = await db.query('select * from countries');
    response.send(dbResult.rows);
}
*/


function onEachRequest(request, response, next) {
    console.log(new Date(), request.method, request.url);
    next();
}

function onServerReady() {
    console.log('Webserver running on port', port);
}

// Get all continents
server.get('/api/continents', async (request, response) => {
    const query = ` 
        select continent_id, continent_name 
        from continents 
        order by continent_name`;
    const dbResult = await db.query(query);
    response.json(dbResult.rows);
});

// Get countries by continent
server.get('/api/continents/:continentId/countries', async (request, response) => {
    const query = `
        select c.country_id, c.country_name, c.country_iso
        from countries c
        join continents cont on c.continent_id = cont.continent_id
        where c.continent_id = $1
        order by c.country_name`;
    const dbResult = await db.query(query, [request.params.continentId]);
    response.json(dbResult.rows);
});


// Get specific country data
server.get('/api/countries/:countryId', async (request, response) => {
    const countryId = Number(request.params.countryId);
    const query = `
        select distinct on (m.year)
            c.country_id,
            c.country_name,
            c.country_iso,
            cont.continent_name,
            cont.continent_id,
            m.year,
            m.gini,
            cont_avgs.continent_avg_gini,
            m.fertility_rate,
            cont_avgs.continent_avg_fertility,
            round((m.gdp::numeric / m.total_population)::numeric, 2) as gdp_per_citizen,
            round(cont_avgs.continent_avg_gdp_per_citizen::numeric, 2) as continent_avg_gdp_per_citizen
        from countries c
        join continents cont on c.continent_id = cont.continent_id
        join metrics m on c.country_id = m.country_id
        left join (
        select 
            m.year,
            cont.continent_id,
            round(avg(m.gini)::numeric, 2) as continent_avg_gini,
            round(avg(m.fertility_rate)::numeric, 2) as continent_avg_fertility,
            avg(m.gdp::numeric / m.total_population) as continent_avg_gdp_per_citizen
        from metrics m
        join countries c on m.country_id = c.country_id
        join continents cont on c.continent_id = cont.continent_id
        group by m.year, cont.continent_id
        ) cont_avgs on m.year = cont_avgs.year 
        and cont.continent_id = cont_avgs.continent_id
        where c.country_id = $1
        order by m.year;
         `;
    
    try {
        const dbResult = await db.query(query, [countryId]);

        if (dbResult.rows.length === 0) {
            return response.status(400).json({error: 'Country not found'});
        }

        return response.json(dbResult.rows);

    } 
    catch(error) {
        console.error('Database error;', error);
        return response.status(500).json({error: 'Internal server error - check your pg.'})
    }
});

// Get data for world map
server.get('/api/world_data', async (request, response) => {
    const query = `
        select 
            c.country_id, 
            c.country_name, 
            c.country_iso,
            cont.continent_name,
            cont.continent_id,
            em.year,
            em.gini,
            em.palma_ratio
        from countries c
        join continents cont on c.continent_id = cont.continent_id
        join metrics em on c.country_id = em.country_id
        order by c.country_name, em.year`;

        const result = await db.query(query); 

        // Transform result to requried format for our world map.
        const worldData = result.rows.reduce((acc, row) => {
            // Year as string
            const year = row.year.toString();
            
            // Year as object since we need to group by year, country_name
            if (!acc[year]) {
                acc[year] = {};
            }
            
            // Generate object with relevant data, year, country_name {data}
            acc[year][row.country_name] = { // Use Country name as object key to geojson match
                countryId: row.country_id,
                continentName: row.continent_name,
                continentId: row.continent_id,
                gini: row.gini,
                palmaRatio: row.palma_ratio
            };
            
            return acc;
        }, {});

        response.json({
            success: true,
            data: worldData
        });

    });