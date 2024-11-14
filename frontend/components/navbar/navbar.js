export async function initializeNavbar() {
    try {
        const continentsResponse = await fetch('/api/continents');
        const continents = await continentsResponse.json();
        
        const continentsList = document.getElementById('continents-list');
        
        for (const continent of continents) {
            const continentContainer = document.createElement('div');
            continentContainer.className = 'dropdown-item';
            
            const continentLink = document.createElement('a');
            continentLink.href = `#${continent.continent_name}`;
            continentLink.textContent = continent.continent_name;
            
            const countriesContainer = document.createElement('div');
            countriesContainer.className = 'continent-content';
            
            const countriesResponse = await fetch(`/api/continents/${continent.continent_id}/countries`);
            const countries = await countriesResponse.json();
            
            countries.forEach(country => {
                const countryLink = document.createElement('a');
                countryLink.href = `country.html?id=${country.country_id}`;
                
                const countryName = document.createElement('span');
                countryName.textContent = country.country_name;
                
                const countryIso = document.createElement('span');
                countryIso.className = 'country-iso';
                countryIso.textContent = `(${country.country_iso})`;
                
                countryLink.appendChild(countryName);
                countryLink.appendChild(countryIso);
                countriesContainer.appendChild(countryLink);
            });
            
            continentContainer.appendChild(continentLink);
            continentContainer.appendChild(countriesContainer);
            continentsList.appendChild(continentContainer);
        }
    } catch (error) {
        console.error('Error initializing navbar:', error);
    }
}