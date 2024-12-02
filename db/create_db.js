import pg from 'pg';
import dotenv from 'dotenv';
import { pipeline } from 'node:stream/promises'
import fs from 'node:fs'
import { from as copyFrom } from 'pg-copy-streams'

dotenv.config();

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

async function initializeDatabase() {
    const client = await db.connect();   
    try {
        console.log('Creating tables...');
        
        // Create tables
        await client.query(`

            /* DDL */ 
            /* Documentation:*/

            drop table if exists countries cascade;
            drop table if exists continents cascade;
            drop table if exists metrics cascade;
            drop table if exists social_metrics cascade;
            drop table if exists economic_metrics cascade;

            create table continents (
            continent_id int not null generated always as identity primary key,
            continent_name text not null
            );

            create table countries (
            country_id int not null generated always as identity primary key, 
            country_name text not null,
            country_iso varchar(2) not null unique,
            continent_id int not null references continents(continent_id) on delete cascade
            );

            create table metrics (
            metric_id int not null generated always as identity primary key, 
            country_id int not null references countries(country_id) on delete cascade,
            year int not null check (year >= 1990 AND year <= 2022), 
            top_10_richest_share decimal (5,2) check (top_10_richest_share > 0 AND top_10_richest_share <= 100), 
            bottom_50_poorest_share decimal (5,2) check (bottom_50_poorest_share > 0 AND bottom_50_poorest_share <= 100),
            top_1_richest_share decimal (5,2) check (top_1_richest_share > 0 AND top_1_richest_share <= 100),
            gdp bigint check(gdp > 0), 
            gini decimal (5,2) check (gini > 0 AND gini <= 100), 
            palma_ratio decimal (6,2) check (palma_ratio > 0),
            fertility_rate decimal(5,2) check (fertility_rate > 0),
            total_population bigint check (total_population > 0),
            constraint unique_countryid_year unique (country_id, year)
            );
    
            /*Indexes - Countries*/
            create index idx_country_id on countries(country_id);
            create index idx_country_iso on countries(country_iso);

            /*Indexes - Metrics*/
            create index idx_m_country_year on metrics(country_id,year);
            create index idx_m_year on metrics(year);

        `);

        console.log('Tables created successfully');

        // Copy data from CSV files
        console.log('Copying data from CSV files...');

        // Copy data from continents
        await copyIntoTable(client, `
            copy continents (continent_name)
            from stdin
            with csv header`, 'db/regions.csv');
        
        // Copy data from countries
        await copyIntoTable(client, `
            copy countries (country_name, country_iso, continent_id)
            from stdin
            with csv header
            delimiter ';'`, 'db/countries.csv');

        // Copy data into economic_metrics
        await copyIntoTable(client, `
            copy metrics (country_id, year,top_10_richest_share,bottom_50_poorest_share,top_1_richest_share,gdp,gini,palma_ratio,total_population,fertility_rate)
            from stdin
            with csv header
            delimiter ','`, 'db/nyeste_projekt_data.csv');

        console.log('Data copied successfully');

        // Transform data - start
        console.log('DML started');

        // Fixing country_name != geojson "name"
        await client.query(`
            update countries
            set country_name = case 
                when country_name = 'United Kingdom' then 'England'
                when country_name = 'Guinea-Bissau' then 'Guinea Bissau'
                when country_name = 'Serbia' then 'Republic of Serbia'
                when country_name = 'Congo' then 'Republic of the Congo'
                when country_name = 'Bahamas' then 'The Bahamas'
                when country_name = 'United States' then 'USA'
                else country_name
            end 
            where country_name in ('United Kingdom','Guinea-Bissau','Serbia','Congo','Bahamas','United States')
            `)
        
        // Deleting countries with no metrics at all
        await client.query(`
            delete from countries where country_id not in (
                select country_id from metrics where country_id in (select distinct country_id from countries)
            group by country_id)
            `)
        
        // Deleting countries with less than 5 year of metrics
        await client.query(`
            delete from countries where country_id in( 
            select country_id from metrics
            group by country_id
            having count(*) < 5
            order by count(*))
            `)

        // Fixing null values for ['gdp] - using partition to:
        // 1. Use original GDP if not null 
        // 2. Use previous year's GDP (lag)
        // 3. First Value, we use the latest data 
        await client.query(`
            with filled_data as (
            select 
                country_id,
                year,
                coalesce(
                    gdp,
                    lag(gdp) over (partition by country_id order by year),
                    first_value(gdp) over (
                        partition by country_id 
                        order by case when gdp is not null then year end nulls last
                    )
                ) as filled_gdp
            from metrics
            )
            update metrics m
            set gdp = f.filled_gdp
            from filled_data f
            where m.country_id = f.country_id 
            and m.year = f.year
            and m.gdp is null;
        `)

 
        console.log('Transformtion finished')    

    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    } finally {
        client.release();
        await db.end();
    }
}


// Copy data from csv files to PG
async function copyIntoTable(client, sql, file) {
    try {
        const ingestStream = client.query(copyFrom(sql));
        const sourceStream = fs.createReadStream(file);
        await pipeline(sourceStream, ingestStream);
    } catch (error) {
        console.error(`Error copying data from ${file}:`, error);
        throw error;
    }
}


// Run initialization
initializeDatabase()
    .then(() => console.log('Database initialization completed'))
    .catch(console.error);