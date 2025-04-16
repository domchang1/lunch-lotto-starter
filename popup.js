const defaultSettings = {
  distance: 0.5,       // Default search radius in miles
  price: "2,3",        // Google Places API uses 1-4 ($ - $$$$)
  dietary: "",         // Empty means no filter (future: vegetarian, gluten-free, etc.)
};
let restaurantHistory = [];

// Convert miles to meters (Google Maps API uses meters)
function milesToMeters(miles) {
  return miles * 1609.34;
}

// Load user settings or use defaults
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaultSettings, (settings) => {
      resolve(settings);
    });
  });
}

async function fetchRestaurants() {
  try {
    // Show Loading GIF and Hide the Wheel
    document.getElementById("loading-gif").style.display = "block";
    document.getElementById("wheel").style.display = "none";

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude: lat, longitude: lng } = position.coords;
      const settings = await loadSettings();
      
      // Calculate radius in meters
      const radius = milesToMeters(settings.distance);
      
      // Create Overpass API query for restaurants
      // This searches for nodes and ways tagged as restaurants within the specified radius
      const overpassQuery = `
        [out:json];
        (
          node["amenity"="restaurant"](around:${radius},${lat},${lng});
          way["amenity"="restaurant"](around:${radius},${lat},${lng});
          relation["amenity"="restaurant"](around:${radius},${lat},${lng});
        );
        out body;
        >;
        out skel qt;
      `;
      
      // Overpass API endpoint
      const overpassUrl = "https://overpass-api.de/api/interpreter";
      
      // Use fetch to send the query
      const response = await fetch(overpassUrl, {
        method: 'POST',
        body: overpassQuery,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.elements || data.elements.length === 0) {
        console.error("❌ No restaurants found!");
        alert("No restaurants found! Try adjusting your settings.");
        document.getElementById("loading-gif").style.display = "none";
        document.getElementById("wheel").style.display = "block";
        return;
      }
      
      // Process the results
      // Filter for elements that are tagged as restaurants and have names
      const restaurantElements = data.elements.filter(element => 
        element.tags && 
        element.tags.amenity === 'restaurant' && 
        element.tags.name
      );
      
      if (restaurantElements.length === 0) {
        console.error("❌ No named restaurants found!");
        alert("No restaurants found with names! Try adjusting your settings.");
        document.getElementById("loading-gif").style.display = "none";
        document.getElementById("wheel").style.display = "block";
        return;
      }
      
      // Extract restaurant data
      let restaurants = restaurantElements.map(element => {
        // For ways and relations, use the center coordinates if available
        const elementLat = element.center ? element.center.lat : element.lat;
        const elementLng = element.center ? element.center.lon : element.lon;
        
        // Estimate a price level (1-4) if "price" tag exists, otherwise use a default
        let priceLevel = 2; // Default to mid-range
        if (element.tags.price) {
          // Some OSM elements use $ symbols for price ranges
          if (element.tags.price.includes('$')) {
            priceLevel = element.tags.price.split('$').length - 1;
          } 
          // Others might use numerical values
          else if (!isNaN(element.tags.price)) {
            priceLevel = parseInt(element.tags.price);
          }
          // Ensure it's within our 1-4 range
          priceLevel = Math.min(Math.max(priceLevel, 1), 4);
        }
        
        // Create a dollar sign representation of the price
        const priceSign = "$".repeat(priceLevel);
        
        // Create OSM URL for the element
        const osmId = element.id;
        const osmType = element.type === 'node' ? 'node' : (element.type === 'way' ? 'way' : 'relation');
        const osmUrl = `https://www.openstreetmap.org/${osmType}/${osmId}`;
        
        return {
          name: element.tags.name,
          distance: (settings.distance).toFixed(1),
          price: priceSign,
          lat: elementLat,
          lng: elementLng,
          osmId: osmId,
          osmType: osmType,
          // Use OSM's share URL format
          osmUrl: osmUrl,
          // Create a link to view on OSM
          mapUrl: `https://www.openstreetmap.org/?mlat=${elementLat}&mlon=${elementLng}&zoom=18`
        };
      });
      
      // Filter by price if specified in settings
      if (settings.price) {
        const [minPrice, maxPrice] = settings.price.split(',').map(Number);
        restaurants = restaurants.filter(restaurant => {
          const restaurantPrice = restaurant.price.length;
          return restaurantPrice >= minPrice && restaurantPrice <= maxPrice;
        });
      }
      
      // Remove duplicate restaurant names
      const seen = new Set();
      restaurants = restaurants.filter((restaurant) => {
        if (seen.has(restaurant.name)) {
          return false; // Duplicate found, skip this restaurant
        }
        seen.add(restaurant.name);
        return true; // Unique restaurant, keep it
      });
      
      console.log("✅ Unique Restaurants fetched:", restaurants);
      
      // Store restaurant details globally
      restaurantDetails = restaurants.reduce((acc, r) => {
        acc[r.name] = r;
        return acc;
      }, {});
      
      // Wait before showing the wheel
      setTimeout(() => {
        document.getElementById("loading-gif").style.display = "none"; // Hide Loading GIF
        document.getElementById("wheel").style.display = "block"; // Show the wheel
        updateWheel(restaurants); // Update the wheel with restaurant names
      }, 2000);
      
    }, (error) => {
      console.error("❌ Geolocation error:", error);
      alert("Please enable location access to fetch restaurants.");
      document.getElementById("loading-gif").style.display = "none"; // Hide loading GIF on error
      document.getElementById("wheel").style.display = "block";
    });
  } catch (error) {
    console.error("❌ Error fetching restaurants:", error);
    document.getElementById("loading-gif").style.display = "none"; // Hide loading GIF on error
    document.getElementById("wheel").style.display = "block";
  }
}

  function updateWheel(restaurants) {
    options.length = 0; // Clear the current options array
  
    // Randomly shuffle the restaurants array
    const shuffledRestaurants = [...restaurants].sort(() => Math.random() - 0.5);
  
    // Choose 8 random restaurants
    const selectedRestaurants = shuffledRestaurants.slice(0, 8);
  
    // Extract restaurant names and Google Maps links, and populate options array
    options.push(...selectedRestaurants.map((restaurant) => ({
      name: restaurant.name,
      mapUrl: restaurant.mapUrl, 
    })));
  
    // Debugging: Log the selected restaurants with their links
    console.log("✅ Options for the Wheel:", options);
  
    // Store full restaurant details, including names and links
    restaurantDetails = selectedRestaurants.map((restaurant) => ({
      name: restaurant.name,
      mapUrl: restaurant.mapUrl 
    }));
  
    console.log("✅ Selected Restaurants for the Wheel:", restaurantDetails);
  
    // Redraw the wheel with the updated options
    drawWheel();
  }  

// 🛠️ Toggle Settings View
function showSettings() {
  document.getElementById("main-view").style.display = "none";
  document.getElementById("settings-view").style.display = "block";
}

function hideSettings() {
  document.getElementById("main-view").style.display = "block";
  document.getElementById("settings-view").style.display = "none";
}

// Ensure scripts run only after DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  await loadHistory();
  await fetchRestaurants();

  // Spin button event
  document.getElementById("spin").addEventListener("click", () => spin());

  // Open settings view
  document.getElementById("open-settings").addEventListener("click", showSettings);

  // Close settings view
  document.getElementById("close-settings").addEventListener("click", hideSettings);

  document.getElementById("open-history").addEventListener("click", showHistory);
  document.getElementById("close-history").addEventListener("click", hideHistory);

  // Load saved settings into inputs
  const settings = await loadSettings();
  document.getElementById("distance").value = settings.distance;
  document.getElementById("price").value = settings.price;

  // Save settings
  document.getElementById("save-settings").addEventListener("click", async () => {
    const distance = parseFloat(document.getElementById("distance").value);
    const price = document.getElementById("price").value;
  
    // Save the updated settings
    chrome.storage.sync.set({ distance, price }, async () => {
      swal({
        title: `Settings saved!`,
        icon: "success",
        button: false, // Hide the default OK button
      });
  
      // Hide the settings view and fetch new restaurants
      hideSettings();
      await fetchRestaurants(); // Fetch restaurants with the new settings
    });
  });  
});

async function loadHistory() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ history: [] }, (data) => {
      restaurantHistory = data.history;
      resolve(restaurantHistory);
    });
  });
}

function saveToHistory(restaurant) {
  const historyEntry = {
    ...restaurant,
    timestamp: new Date().toISOString()
  };
  
  restaurantHistory.unshift(historyEntry);
  
  if (restaurantHistory.length > 20) {
    restaurantHistory = restaurantHistory.slice(0, 20);
  }
  
  chrome.storage.sync.set({ history: restaurantHistory });
}

function showHistory() {
  document.getElementById("main-view").style.display = "none";
  document.getElementById("history-view").style.display = "block";
  
  const historyList = document.getElementById("history-list");
  historyList.innerHTML = ""; 
  
  if (restaurantHistory.length === 0) {
    historyList.innerHTML = "<li class='no-history'>No restaurant history yet</li>";
    return;
  }
  
  restaurantHistory.forEach((entry, index) => {
    const date = new Date(entry.timestamp);
    const formattedDate = date.toLocaleDateString();
    const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      <div class="history-restaurant">
        <span class="history-name">${entry.name}</span>
        <span class="history-date">${formattedDate}, ${formattedTime}</span>
      </div>
      <div class="history-actions">
        <button class="view-on-map" data-index="${index}">View on Map</button>
        <button class="add-to-wheel" data-index="${index}">Add to Wheel</button>
      </div>
    `;
    historyList.appendChild(li);
  });
  
  document.querySelectorAll(".view-on-map").forEach(button => {
    button.addEventListener("click", (e) => {
      const index = e.target.getAttribute("data-index");
      window.open(restaurantHistory[index].mapUrl, '_blank');
    });
  });
  
  document.querySelectorAll(".view-on-map").forEach(button => {
    button.addEventListener("click", (e) => {
      const index = e.target.getAttribute("data-index");
      // Make sure to use the full URL
      const mapUrl = restaurantHistory[index].mapUrl || 
        `https://www.openstreetmap.org/?mlat=${restaurantHistory[index].lat}&mlon=${restaurantHistory[index].lng}&zoom=18`;
      window.open(mapUrl, '_blank');
    });
  });
  
  document.querySelectorAll(".add-to-wheel").forEach(button => {
    button.addEventListener("click", (e) => {
      const index = e.target.getAttribute("data-index");
      addRestaurantToWheel(restaurantHistory[index]);
      hideHistory();
    });
  });
}

function hideHistory() {
  document.getElementById("main-view").style.display = "block";
  document.getElementById("history-view").style.display = "none";
}

function addRestaurantToWheel(restaurant) {
  if (options.length >= 8) {
    options.pop();
  }
  
  options.push({
    name: restaurant.name,
    mapUrl: restaurant.mapUrl
  });
  
  // Redraw the wheel
  drawWheel();
}