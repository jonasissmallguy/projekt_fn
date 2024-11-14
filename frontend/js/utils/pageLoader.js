async function loadComponent(elementId, path) {
    try {
        const response = await fetch(path);
        const html = await response.text();
        document.getElementById(elementId).innerHTML = html;
    } catch (error) {
        console.error(`Error loading component from ${path}:`, error);
    }
}

import { initializeNavbar } from '../../components/navbar/navbar.js';

export async function initializePage() {
    try {
        // Updated paths to match the frontend folder structure
        await loadComponent('navbar-container', '/components/navbar/navbar.html');
        await loadComponent('footer-container', '/components/footer/footer.html');
        
        await initializeNavbar();
    } catch (error) {
        console.error('Error initializing page:', error);
    }
}