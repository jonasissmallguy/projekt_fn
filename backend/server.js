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
        select 
            c.country_id, 
            c.country_name, 
            c.country_iso,
            cont.continent_name,
            cont.continent_id
        from countries c
        join continents cont on c.continent_id = cont.continent_id
        where c.country_id = $1`;
    const dbResult = await db.query(query, [request.params.countryId]);
    if (dbResult.rows.length === 0) {
        response.status(404).json({ error: 'Country not found' });
        return;
    }
    response.json(dbResult.rows[0]);
});