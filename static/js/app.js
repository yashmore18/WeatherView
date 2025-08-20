// Weather App Frontend JavaScript
class WeatherApp {
    constructor() {
        this.chart = null;
        this.currentUnits = localStorage.getItem('weatherUnits') || 'metric';
        this.favorites = JSON.parse(localStorage.getItem('weatherFavorites') || '[]');
        this.lastSearchDebounce = null;
        this.isLoading = false;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateUnitsToggle();
        this.renderFavorites();
        
        // Load last searched city from localStorage if available
        const lastCity = localStorage.getItem('lastWeatherCity');
        if (lastCity) {
            this.searchWeather(lastCity);
        }
    }
    
    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('citySearch');
        const searchButton = document.getElementById('searchButton');
        const clearButton = document.getElementById('clearSearch');
        
        searchInput.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value);
        });
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.searchWeather(e.target.value);
            }
        });
        
        searchButton.addEventListener('click', () => {
            this.searchWeather(searchInput.value);
        });
        
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            this.hideSearchDropdown();
            searchInput.focus();
        });
        
        // Geolocation
        const locationButton = document.getElementById('useLocationButton');
        locationButton.addEventListener('click', () => {
            this.getLocationWeather();
        });
        
        // Units toggle
        const unitsToggle = document.getElementById('unitsToggle');
        unitsToggle.addEventListener('change', (e) => {
            this.toggleUnits(e.target.checked);
        });
        
        // Dark mode toggle
        const darkModeToggle = document.getElementById('darkModeToggle');
        darkModeToggle.addEventListener('change', (e) => {
            this.toggleDarkMode(e.target.checked);
        });
        
        // Initialize dark mode
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedDarkMode = localStorage.getItem('darkMode');
        const isDarkMode = savedDarkMode ? savedDarkMode === 'true' : prefersDark;
        
        darkModeToggle.checked = isDarkMode;
        this.toggleDarkMode(isDarkMode);
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideSearchDropdown();
            }
        });
    }
    
    handleSearchInput(query) {
        clearTimeout(this.searchTimeout);
        
        if (query.trim().length >= 2) {
            this.searchTimeout = setTimeout(() => {
                this.searchLocations(query.trim());
            }, 300);
        } else if (query.trim().length === 0) {
            this.hideSearchDropdown();
        }
    }
    
    async searchLocations(query) {
        try {
            const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`);
            
            if (!response.ok) {
                throw new Error('Failed to search locations');
            }
            
            const locations = await response.json();
            this.showSearchDropdown(locations);
            
        } catch (error) {
            console.error('Error searching locations:', error);
            this.hideSearchDropdown();
        }
    }
    
    showSearchDropdown(locations) {
        const dropdown = document.getElementById('searchDropdown');
        
        if (!locations || locations.length === 0) {
            this.hideSearchDropdown();
            return;
        }
        
        dropdown.innerHTML = locations.map(location => `
            <button class="dropdown-item d-flex justify-content-between align-items-center" 
                    type="button" 
                    data-lat="${location.lat}" 
                    data-lon="${location.lon}"
                    data-name="${location.display_name}">
                <div>
                    <div class="fw-semibold">${location.name}</div>
                    <small class="text-muted">${location.state} ${location.country}</small>
                </div>
                <i class="fas fa-map-marker-alt text-muted"></i>
            </button>
        `).join('');
        
        dropdown.classList.add('show');
        
        // Add click handlers for dropdown items
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const lat = e.currentTarget.dataset.lat;
                const lon = e.currentTarget.dataset.lon;
                const name = e.currentTarget.dataset.name;
                
                document.getElementById('citySearch').value = name;
                this.hideSearchDropdown();
                this.searchWeatherByCoords(parseFloat(lat), parseFloat(lon));
            });
        });
    }
    
    hideSearchDropdown() {
        const dropdown = document.getElementById('searchDropdown');
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
    }
    
    async searchWeatherByCoords(lat, lon) {
        if (this.isLoading) return;
        
        try {
            this.setLoading(true);
            this.clearError();
            
            // Fetch current weather and forecast using coordinates
            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrentWeather({ lat, lon, units: this.currentUnits }),
                this.fetchForecast({ lat, lon, units: this.currentUnits })
            ]);
            
            this.displayCurrentWeather(currentData);
            this.displayForecast(forecastData);
            this.displayDailyForecast(forecastData);
            
            // Fetch air quality data
            try {
                const airQualityData = await this.fetchAirQuality(lat, lon);
                this.displayAirQuality(airQualityData, currentData.visibility);
            } catch (error) {
                console.warn('Air quality data unavailable:', error);
            }
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    debounceSearch(query) {
        clearTimeout(this.lastSearchDebounce);
        
        if (query.trim().length > 2) {
            this.lastSearchDebounce = setTimeout(() => {
                this.searchWeather(query);
            }, 300);
        }
    }
    
    async searchWeather(city) {
        if (!city || city.trim().length === 0) {
            this.showError('Please enter a city name');
            return;
        }
        
        if (this.isLoading) return;
        
        try {
            this.setLoading(true);
            this.clearError();
            
            // Fetch current weather and forecast
            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrentWeather({ city: city.trim(), units: this.currentUnits }),
                this.fetchForecast({ city: city.trim(), units: this.currentUnits })
            ]);
            
            this.displayCurrentWeather(currentData);
            this.displayForecast(forecastData);
            this.displayDailyForecast(forecastData);
            
            // Fetch air quality data if coordinates are available
            if (currentData.lat && currentData.lon) {
                try {
                    const airQualityData = await this.fetchAirQuality(currentData.lat, currentData.lon);
                    this.displayAirQuality(airQualityData, currentData.visibility);
                } catch (error) {
                    console.warn('Air quality data unavailable:', error);
                }
            }
            
            // Save last searched city
            localStorage.setItem('lastWeatherCity', city.trim());
            
        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }
    
    async getLocationWeather() {
        if (!navigator.geolocation) {
            this.showError('Geolocation is not supported by this browser');
            return;
        }
        
        if (this.isLoading) return;
        
        try {
            this.setLoading(true);
            this.clearError();
            
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    enableHighAccuracy: true
                });
            });
            
            const { latitude, longitude } = position.coords;
            
            // Fetch current weather and forecast using coordinates
            const [currentData, forecastData] = await Promise.all([
                this.fetchCurrentWeather({ lat: latitude, lon: longitude, units: this.currentUnits }),
                this.fetchForecast({ lat: latitude, lon: longitude, units: this.currentUnits })
            ]);
            
            this.displayCurrentWeather(currentData);
            this.displayForecast(forecastData);
            this.displayDailyForecast(forecastData);
            
            // Fetch air quality data
            try {
                const airQualityData = await this.fetchAirQuality(latitude, longitude);
                this.displayAirQuality(airQualityData, currentData.visibility);
            } catch (error) {
                console.warn('Air quality data unavailable:', error);
            }
            
            // Update search input with city name
            document.getElementById('citySearch').value = currentData.city;
            
        } catch (error) {
            if (error.code === 1) {
                this.showError('Location access denied. Please search for a city manually.');
            } else if (error.code === 2) {
                this.showError('Location information unavailable. Please search for a city manually.');
            } else if (error.code === 3) {
                this.showError('Location request timeout. Please search for a city manually.');
            } else {
                this.showError(error.message || 'Failed to get location');
            }
        } finally {
            this.setLoading(false);
        }
    }
    
    async fetchCurrentWeather(params) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`/api/weather/current?${queryString}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch weather data');
        }
        
        return await response.json();
    }
    
    async fetchForecast(params) {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`/api/weather/forecast?${queryString}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch forecast data');
        }
        
        return await response.json();
    }
    
    async fetchAirQuality(lat, lon) {
        const response = await fetch(`/api/air-quality?lat=${lat}&lon=${lon}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch air quality data');
        }
        
        return response.json();
    }
    
    displayCurrentWeather(data) {
        const currentWeather = document.getElementById('currentWeather');
        const localTime = new Date(data.local_time_iso).toLocaleString();
        
        currentWeather.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h3 class="mb-1 text-dark">${data.city}, ${data.country}</h3>
                    <small class="text-secondary">${localTime}</small>
                </div>
                <button class="btn btn-link p-0" onclick="app.toggleFavorite('${data.city}')">
                    <i class="fas fa-star ${this.isFavorite(data.city) ? 'text-warning' : 'text-secondary'}"></i>
                </button>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <div class="d-flex align-items-center mb-3">
                        <img src="https://openweathermap.org/img/w/${data.icon}.png" 
                             alt="${data.description}" class="me-2">
                        <div>
                            <h2 class="mb-0 text-primary fw-bold">${data.temp}${data.temp_unit}</h2>
                            <p class="text-secondary mb-0">Feels like ${data.feels_like}${data.temp_unit}</p>
                        </div>
                    </div>
                    <p class="mb-1 text-dark fw-medium">${data.description}</p>
                </div>
                
                <div class="col-md-6">
                    <div class="row g-2">
                        <div class="col-6">
                            <div class="info-item">
                                <label class="text-muted small">Humidity</label>
                                <div>${data.humidity}%</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="info-item">
                                <label class="text-muted small">Wind Speed</label>
                                <div>${data.wind_speed} ${data.wind_unit}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="info-item">
                                <label class="text-muted small">Pressure</label>
                                <div>${data.pressure} hPa</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="info-item">
                                <label class="text-muted small">Visibility</label>
                                <div>${data.visibility} km</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Show the weather card
        document.getElementById('weatherCard').style.display = 'block';
    }
    
    displayDailyForecast(data) {
        if (!data.daily_forecast || data.daily_forecast.length === 0) {
            return;
        }
        
        const dailyForecast = document.getElementById('dailyForecast');
        const today = new Date().toISOString().split('T')[0];
        
        const forecastItems = data.daily_forecast.map((day, index) => {
            const date = new Date(day.date);
            const isToday = day.date === today;
            const dayName = isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'long' });
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            return `
                <div class="col-lg-3 col-md-6 mb-3">
                    <div class="daily-forecast-item p-3 rounded border">
                        <div class="text-center">
                            <div class="fw-bold ${isToday ? 'text-primary' : ''}">${dayName}</div>
                            <small class="text-muted">${dateStr}</small>
                        </div>
                        <div class="d-flex align-items-center justify-content-between mt-2">
                            <img src="https://openweathermap.org/img/w/${day.icon}.png" 
                                 alt="${day.description}" style="width: 40px;">
                            <div class="text-end">
                                <div class="fw-bold text-danger">High ${day.temp_max}°</div>
                                <small class="text-info">Low ${day.temp_min}°</small>
                            </div>
                        </div>
                        <div class="small text-secondary text-center mt-1 fw-medium">${day.description}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        dailyForecast.innerHTML = forecastItems;
        document.getElementById('dailyForecastCard').style.display = 'block';
    }
    
    displayAirQuality(airData, visibility) {
        const airQualityData = document.getElementById('airQualityData');
        
        // AQI color coding
        const aqiColors = {
            1: '#00e400', // Good
            2: '#ffff00', // Fair
            3: '#ff7e00', // Moderate
            4: '#ff0000', // Poor
            5: '#8f3f97'  // Very Poor
        };
        
        const aqiColor = aqiColors[airData.aqi] || '#666';
        
        airQualityData.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <div class="d-flex align-items-center mb-3">
                        <div class="aqi-indicator rounded-circle me-3" 
                             style="width: 60px; height: 60px; background-color: ${aqiColor}; display: flex; align-items: center; justify-content: center;">
                            <span class="fw-bold text-white">${airData.aqi}</span>
                        </div>
                        <div>
                            <h5 class="mb-0">Air Quality Index</h5>
                            <span class="badge" style="background-color: ${aqiColor}; color: white;">
                                ${airData.aqi_description}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="row g-2">
                        <div class="col-6">
                            <div class="info-item">
                                <label class="text-muted small">PM2.5</label>
                                <div>${Math.round(airData.pm2_5)} μg/m³</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="info-item">
                                <label class="text-muted small">PM10</label>
                                <div>${Math.round(airData.pm10)} μg/m³</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="info-item">
                                <label class="text-muted small">NO₂</label>
                                <div>${Math.round(airData.no2)} μg/m³</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="info-item">
                                <label class="text-muted small">O₃</label>
                                <div>${Math.round(airData.o3)} μg/m³</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="mt-3 p-3 rounded bg-light">
                <h6 class="mb-2"><i class="fas fa-info-circle me-2"></i>Air Quality Guidelines</h6>
                <div class="row small">
                    <div class="col-md-6">
                        <div><span class="badge me-2" style="background-color: #00e400;">1</span>Good - Air quality is satisfactory</div>
                        <div><span class="badge me-2" style="background-color: #ffff00; color: #000;">2</span>Fair - Acceptable for most people</div>
                        <div><span class="badge me-2" style="background-color: #ff7e00;">3</span>Moderate - Sensitive groups may experience symptoms</div>
                    </div>
                    <div class="col-md-6">
                        <div><span class="badge me-2" style="background-color: #ff0000;">4</span>Poor - Health warnings of emergency conditions</div>
                        <div><span class="badge me-2" style="background-color: #8f3f97;">5</span>Very Poor - Health alert, everyone may be affected</div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('airQualityCard').style.display = 'block';
    }
    
    displayForecast(data) {
        // Update chart
        this.updateTemperatureChart(data.points);
        
        // Update forecast list
        const forecastList = document.getElementById('forecastList');
        const forecastItems = data.points.slice(0, 10).map(point => {
            const date = new Date(point.ts_iso);
            const time = date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit'
            });
            
            return `
                <div class="col-lg-6 mb-2">
                    <div class="d-flex justify-content-between align-items-center p-2 border rounded">
                        <div class="d-flex align-items-center">
                            <img src="https://openweathermap.org/img/w/${point.icon}.png" 
                                 alt="${point.description}" class="me-2" style="width: 32px;">
                            <div>
                                <div class="fw-bold">${time}</div>
                                <small class="text-muted">${point.description}</small>
                            </div>
                        </div>
                        <div class="text-end">
                            <div class="fw-bold">${point.temp}${point.temp_unit}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        forecastList.innerHTML = forecastItems;
        
        // Show the forecast card
        document.getElementById('forecastCard').style.display = 'block';
    }
    
    updateTemperatureChart(points) {
        const ctx = document.getElementById('temperatureChart').getContext('2d');
        
        // Prepare data for Chart.js
        const labels = points.slice(0, 12).map(point => {
            const date = new Date(point.ts_iso);
            return date.toLocaleDateString('en-US', { 
                weekday: 'short',
                hour: '2-digit'
            });
        });
        
        const temperatures = points.slice(0, 12).map(point => point.temp);
        const tempUnit = points[0]?.temp_unit || '°C';
        
        // Destroy existing chart if it exists
        if (this.chart) {
            this.chart.destroy();
        }
        
        // Detect current theme
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const textColor = isDark ? '#ffffff' : '#666666';
        const gridColor = isDark ? '#404040' : '#e0e0e0';
        
        // Create gradient for the chart
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, isDark ? 'rgba(102, 126, 234, 0.4)' : 'rgba(102, 126, 234, 0.3)');
        gradient.addColorStop(0.5, isDark ? 'rgba(118, 75, 162, 0.2)' : 'rgba(118, 75, 162, 0.15)');
        gradient.addColorStop(1, isDark ? 'rgba(102, 126, 234, 0.05)' : 'rgba(102, 126, 234, 0.02)');
        
        // Create new chart
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Temperature (${tempUnit})`,
                    data: temperatures,
                    borderColor: isDark ? '#667eea' : '#5a6fd8',
                    backgroundColor: gradient,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#764ba2',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: isDark ? 'rgba(33, 37, 41, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: 'rgb(75, 192, 192)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            title: function(context) {
                                const point = points[context[0].dataIndex];
                                const date = new Date(point.ts_iso);
                                return date.toLocaleDateString('en-US', { 
                                    weekday: 'long',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                            },
                            label: function(context) {
                                const point = points[context.dataIndex];
                                return [
                                    `Temperature: ${context.parsed.y}${tempUnit}`,
                                    `Condition: ${point.description}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: `Temperature (${tempUnit})`,
                            color: textColor,
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: textColor,
                            font: {
                                size: 12,
                                weight: 500
                            }
                        },
                        grid: {
                            color: gridColor,
                            lineWidth: 1,
                            borderDash: [2, 2]
                        },
                        border: {
                            display: false
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time',
                            color: textColor,
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        ticks: {
                            color: textColor,
                            font: {
                                size: 11
                            },
                            maxRotation: 45,
                            minRotation: 0
                        },
                        grid: {
                            color: gridColor,
                            lineWidth: 1
                        }
                    }
                },
                elements: {
                    point: {
                        radius: 4,
                        hoverRadius: 8,
                        backgroundColor: 'rgb(75, 192, 192)',
                        borderColor: 'rgb(75, 192, 192)',
                        borderWidth: 2
                    }
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const point = points[index];
                        this.showDetailedWeatherInfo(point);
                    }
                }
            }
        });
    }
    
    showDetailedWeatherInfo(point) {
        const date = new Date(point.ts_iso);
        const formattedDate = date.toLocaleDateString('en-US', { 
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Create a toast notification with detailed info
        const toast = document.createElement('div');
        toast.className = 'toast position-fixed top-0 end-0 m-3';
        toast.style.zIndex = '1055';
        toast.innerHTML = `
            <div class="toast-header">
                <img src="https://openweathermap.org/img/w/${point.icon}.png" 
                     alt="${point.description}" class="me-2" style="width: 24px;">
                <strong class="me-auto">Weather Details</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">
                <div><strong>Time:</strong> ${formattedDate}</div>
                <div><strong>Temperature:</strong> ${point.temp}${point.temp_unit}</div>
                <div><strong>Condition:</strong> ${point.description}</div>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // Show the toast using Bootstrap's Toast component
        const bsToast = new bootstrap.Toast(toast, { autohide: true, delay: 5000 });
        bsToast.show();
        
        // Remove from DOM when hidden
        toast.addEventListener('hidden.bs.toast', () => {
            document.body.removeChild(toast);
        });
    }
    
    toggleUnits(isImperial) {
        this.currentUnits = isImperial ? 'imperial' : 'metric';
        localStorage.setItem('weatherUnits', this.currentUnits);
        
        // Refresh current weather data if displayed
        const currentCity = document.getElementById('citySearch').value;
        if (currentCity) {
            this.searchWeather(currentCity);
        }
    }
    
    updateUnitsToggle() {
        const unitsToggle = document.getElementById('unitsToggle');
        unitsToggle.checked = this.currentUnits === 'imperial';
    }
    
    toggleDarkMode(isDark) {
        const htmlElement = document.documentElement;
        const theme = isDark ? 'dark' : 'light';
        
        htmlElement.setAttribute('data-bs-theme', theme);
        localStorage.setItem('darkMode', isDark.toString());
        
        // Force update chart colors if chart exists
        if (this.chart) {
            this.updateChartTheme(isDark);
        }
        
        // Update icon to reflect current state
        const darkModeLabel = document.querySelector('label[for="darkModeToggle"] i');
        if (darkModeLabel) {
            darkModeLabel.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
    
    updateChartTheme(isDark) {
        if (!this.chart) return;
        
        const textColor = isDark ? '#ffffff' : '#666666';
        const gridColor = isDark ? '#404040' : '#e0e0e0';
        
        this.chart.options.scales.x.ticks = { color: textColor };
        this.chart.options.scales.y.ticks = { color: textColor };
        this.chart.options.scales.x.title = { ...this.chart.options.scales.x.title, color: textColor };
        this.chart.options.scales.y.title = { ...this.chart.options.scales.y.title, color: textColor };
        this.chart.options.scales.x.grid = { color: gridColor };
        this.chart.options.scales.y.grid = { color: gridColor };
        
        this.chart.update();
    }
    
    toggleFavorite(cityName) {
        const index = this.favorites.indexOf(cityName);
        
        if (index > -1) {
            // Remove from favorites
            this.favorites.splice(index, 1);
        } else {
            // Add to favorites (max 5)
            if (this.favorites.length >= 5) {
                this.favorites.shift(); // Remove oldest
            }
            this.favorites.push(cityName);
        }
        
        localStorage.setItem('weatherFavorites', JSON.stringify(this.favorites));
        this.renderFavorites();
        
        // Update the star icon
        const starIcon = document.querySelector('.fa-star');
        if (starIcon) {
            starIcon.className = this.isFavorite(cityName) ? 'fas fa-star text-warning' : 'fas fa-star text-muted';
        }
    }
    
    isFavorite(cityName) {
        return this.favorites.includes(cityName);
    }
    
    renderFavorites() {
        const favoritesContainer = document.getElementById('favorites');
        
        if (this.favorites.length === 0) {
            favoritesContainer.style.display = 'none';
            return;
        }
        
        favoritesContainer.style.display = 'block';
        const favoritesChips = this.favorites.map(city => 
            `<button class="btn btn-outline-secondary btn-sm me-2 mb-2" 
                     onclick="app.searchWeather('${city}')">${city}</button>`
        ).join('');
        
        favoritesContainer.innerHTML = `
            <div class="mb-3">
                <small class="text-muted">Favorites:</small>
                <div class="mt-1">${favoritesChips}</div>
            </div>
        `;
    }
    
    setLoading(loading) {
        this.isLoading = loading;
        const searchButton = document.getElementById('searchButton');
        const locationButton = document.getElementById('useLocationButton');
        
        if (loading) {
            searchButton.disabled = true;
            locationButton.disabled = true;
            searchButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            locationButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            // Show skeleton states
            this.showSkeleton();
        } else {
            searchButton.disabled = false;
            locationButton.disabled = false;
            searchButton.innerHTML = '<i class="fas fa-search"></i>';
            locationButton.innerHTML = '<i class="fas fa-location-arrow"></i> Use My Location';
            
            // Hide skeleton states
            this.hideSkeleton();
        }
    }
    
    showSkeleton() {
        const currentWeather = document.getElementById('currentWeather');
        const forecastList = document.getElementById('forecastList');
        
        // Current weather skeleton
        currentWeather.innerHTML = `
            <div class="placeholder-glow">
                <div class="placeholder col-6 mb-2"></div>
                <div class="placeholder col-4 mb-3"></div>
                <div class="placeholder col-8 mb-2"></div>
                <div class="placeholder col-5 mb-2"></div>
            </div>
        `;
        
        // Forecast skeleton
        forecastList.innerHTML = Array(6).fill().map(() => `
            <div class="col-lg-6 mb-2">
                <div class="placeholder-glow p-2 border rounded">
                    <div class="placeholder col-8 mb-1"></div>
                    <div class="placeholder col-6"></div>
                </div>
            </div>
        `).join('');
        
        document.getElementById('weatherCard').style.display = 'block';
        document.getElementById('forecastCard').style.display = 'block';
    }
    
    hideSkeleton() {
        // Skeleton will be replaced by actual content in display methods
    }
    
    showError(message) {
        const errorContainer = document.getElementById('errorContainer');
        errorContainer.innerHTML = `
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        // Announce error for screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `Error: ${message}`;
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }
    
    clearError() {
        document.getElementById('errorContainer').innerHTML = '';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WeatherApp();
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
