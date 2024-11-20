import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

//load .env
dotenv.config();
console.log('Connecting to database', process.env.PG_DATABASE);

//credentials
const db = new pg.Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD
});

//connect
const dbResult = await db.query('select now()');
console.log('Database connection established on', dbResult.rows[0].now);

const port = process.env.PORT || 3000;
const server = express();

server.use(express.static('frontend'));
server.use(onEachRequest);
server.get('/api/countries', onGetCountries);
server.listen(port, onServerReady);


async function onGetCountries(request, response) {
    const dbResult = await db.query('select * from countries');
    response.send(dbResult.rows);
}

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
    const query = `
        select distinct on (em.year)
            c.country_id,
            c.country_name,
            c.country_iso,
            cont.continent_name,
            cont.continent_id,
            em.year,
            em.gini,
            ca.continent_avg_gini,
            sm.fertility_rate,
            cf.continent_avg_fertility,
            round((em.gdp::numeric / sm.total_population)::numeric, 2) as gdp_per_citizen,
            round(cavg.continent_avg_gdp_per_citizen::numeric, 2) as continent_avg_gdp_per_citizen
        from countries c
        join continents cont on c.continent_id = cont.continent_id
        join economic_metrics em on c.country_id = em.country_id
        join social_metrics sm on c.country_id = sm.country_id and em.year = sm.year
        left join (
            select e.year, cont.continent_id, round(avg(e.gini)::numeric, 2) as continent_avg_gini
            from economic_metrics e
            join countries c on e.country_id = c.country_id
            join continents cont on c.continent_id = cont.continent_id
            group by e.year, cont.continent_id
        )   ca on em.year = ca.year AND cont.continent_id = ca.continent_id
        left join (
            select s.year, cont.continent_id, round(avg(s.fertility_rate)::numeric,2) as continent_avg_fertility
            from social_metrics s
            join countries c on s.country_id = c.country_id
            join continents cont on c.continent_id = cont.continent_id
            group by s.year, cont.continent_id
        )   cf on sm.year = cf.year AND cont.continent_id = cf.continent_id
        left join (
            select 
            e.year,cont.continent_id,avg(e.gdp::numeric / s.total_population) as continent_avg_gdp_per_citizen
            from economic_metrics e
            join social_metrics s on e.country_id = s.country_id and e.year = s.year
            join countries c on e.country_id = c.country_id
            join continents cont on c.continent_id = cont.continent_id
            group by e.year, cont.continent_id
        )   cavg on em.year = cavg.year AND cont.continent_id = cavg.continent_id
        where c.country_id = $1
        order by em.year
         `;
    const dbResult = await db.query(query, [request.params.countryId]);
    if (dbResult.rows.length === 0) {
        response.status(404).json({ error: 'Country not found' });
        return;
    }
    response.json(dbResult.rows);
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
        join economic_metrics em on c.country_id = em.country_id
        order by c.country_name, em.year`;

        const result = await db.query(query); 

        // Transform the data into the format needed by the map
        const worldData = result.rows.reduce((acc, row) => {
            // Year as string
            const year = row.year.toString();
            
            // Year as object since we need to group by year
            if (!acc[year]) {
                acc[year] = {};
            }
            
            // Generate object with relevant data
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