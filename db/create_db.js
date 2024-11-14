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
            drop table if exists countries cascade;
            drop table if exists continents cascade;

            create table continents (
                continent_id int not null generated always as identity primary key,
                continent_name text not null
            );

            create table countries (
                country_id int not null generated always as identity primary key, 
                country_name text not null,
                country_iso varchar(2) not null,
                continent_id int not null references continents(continent_id)
            );
        `);

        console.log('Tables created successfully');

        // Copy data from CSV files
        console.log('Copying data from CSV files...');

        await copyIntoTable(client, `
            copy continents (continent_name)
            from stdin
            with csv header`, 'db/regions.csv');

        await copyIntoTable(client, `
            copy countries (country_name, country_iso, continent_id)
            from stdin
            with csv header
            delimiter ';'`, 'db/countries.csv');

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