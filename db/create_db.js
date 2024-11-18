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
    password: process.env.PG_PASSWORD
});

async function initializeDatabase() {
    const client = await db.connect();
    try {
        console.log('Creating tables...');
        
        // Create tables
        await client.query(`

            /*DDL*/

            drop table if exists countries cascade;
            drop table if exists continents cascade;
            drop table if exists economic_metrics;
            drop table if exists social_metrics;

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

            create table economic_metrics (
            metric_id int not null generated always as identity primary key, 
            country_id int not null references countries(country_id) on delete cascade,
            year int not null check (year >= 1990 AND year <= 2022), 
            top_10_richest_share decimal (5,2) check (top_10_richest_share > 0 AND top_10_richest_share <= 100), 
            bottom_50_poorest_share decimal (5,2) check (bottom_50_poorest_share > 0 AND bottom_50_poorest_share <= 100),
            top_1_richest_share decimal (5,2) check (top_1_richest_share > 0 AND top_1_richest_share <= 100),
            gdp bigint check(gdp > 0), 
            gini decimal (5,2) check (gini > 0 AND gini <= 100), 
            palma_ratio decimal (6,2) check (palma_ratio > 0),
            constraint unique_countryid_year unique (country_id, year)
            );
            
            create table social_metrics (
            metric_id int not null generated always as identity primary key,
            country_id int not null references countries(country_id) on delete cascade,
            year int not null check (year >= 1990 AND year <= 2022), 
            fertility_rate decimal(5,2) check (fertility_rate > 0),
            total_population bigint check (total_population > 0),
            constraint unique_country_id_year unique (country_id,year)
            );

            /*Indexes - Countries*/
            create index idx_country_id on countries(country_id);
            create index idx_country_iso on countries(country_iso);

            /*Indexes - Economic Metrics*/
            create index idx_em_country_year on economic_metrics(country_id,year);
            create index idx_em_year on economic_metrics(year);

            /*Indexes - Social Metrics*/
            create index idx_sm_country_year on social_metrics(country_id,year);
            create index idx_sn_year on social_metrics(year);

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

        //Copy data into economic_metrics
        await copyIntoTable(client, `
            copy economic_metrics (country_id, year,top_10_richest_share,bottom_50_poorest_share,top_1_richest_share,gdp,gini,palma_ratio)
            from stdin
            with csv header
            delimiter ','`, 'db/economic_metrics.csv');

        //Copy data into social_metrics
        await copyIntoTable(client, `
            copy social_metrics (country_id,year,total_population,fertility_rate)
            from stdin
            with csv header
            delimiter ','`, 'db/social_metrics.csv');

        console.log('Data copied successfully');

    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    } finally {
        client.release();
        await db.end();
    }
}

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