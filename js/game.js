// Prepare game start

var DEFAULT_DIFFICULTY = 2;
var DEFAULT_ROUNDS = 5;
var CURRENT_ROUND = 1;
var GUESSES = [];
var OTHER_PEOPLE_GUESSES = {};
var START_DATE = Date.now() / 1000;

var parameters = new URLSearchParams(window.location.search);

var DIFFICULTY = parameters.get("difficulty") == null ? 2 : parameters.get("difficulty");
var TOTAL_ROUNDS = parameters.get("rounds") == null ? 5 : parseInt(parameters.get("rounds"));	
var DEBUG_MODE = parameters.get("debug") == null ? false : true;
var MULTIPLAYER = parameters.get("multiplayer") == 'true' ? true : false;
var GTAV = parameters.get("gtav") == 'true' ? true : false;
console.log(`Multiplayer mode: ${MULTIPLAYER}`);
let connection;
var stableUserId = localStorage.getItem("stable_id");

var LOCATIONS = [];
var CURRENT_LOCATION;

var GUESSED = false;
var GUESSES_TO_SHOW = [];
var OTHER_GUESSES = [];

var IS_OWNER = true;
var PLAYERCOUNT = 1;
var PLAYERS = [];

var MAP;
var SIDEBAR;
var ISLAND_BOUNDS;
var PLACED_MARKER;

var CORRECT_MARKER;
var DISTANCE_LINE;

var ALL_MARKERS = [];
var POLY_LINES = [];

var CENTER = [1500, 1500];
var LAT_BOUNDS = [-3000, 3000];
var LNG_BOUNDS = [3000, -3000];
var MAP_IMAGE = "images/map.png";
var SUBFOLDER = "locations";
var MIN_ZOOM = -2;
var MAX_ZOOM = 2;

async function initializeGame() {
    // Set default values in case of invalid input
    if (DIFFICULTY > 3 || DIFFICULTY < 1) { DIFFICULTY = DEFAULT_DIFFICULTY; }
    if (TOTAL_ROUNDS > 20 || TOTAL_ROUNDS < 3) { TOTAL_ROUNDS = DEFAULT_ROUNDS; }

    if (GTAV) {
        TOTAL_LOCATIONS = 2617;
        GAME_LOCATIONS = GTAV_LOCATIONS;
        MAP_IMAGE = "images/GTAV-HD-MAP-satellite.jpg";
        CENTER = [-4096, 4096];
        LAT_BOUNDS = [-8192, 0];
        LNG_BOUNDS = [0, 8192];
        SUBFOLDER = "locations-v";
        MIN_ZOOM = -3;
        MAX_ZOOM = 0;
        $("#map").css("background-color", "#143d6b");
    }

    if (MULTIPLAYER)
    {
        connection = await new signalR.HubConnectionBuilder()
            .withUrl("https://gtaivbackend.kran.gg/hub")
            .configureLogging(signalR.LogLevel.Information)
            .build();

        connection.on("NameSet", (name) => {
          localStorage.setItem("user_name", name);
        });

        connection.on("KeepAlive", () => {
          // Keep-alive message received, no action needed
        });
    
        connection.on("RoomJoined", (roomName, players, isOwner) => {
            IS_OWNER = isOwner;
            PLAYERCOUNT = players.length;
            PLAYERS = players;
        });

        connection.on("RandomNumbers", (numbers) => {
            if (numbers.length != TOTAL_ROUNDS) {
                console.error("Failed to get the correct amount of random numbers from the server.");
            }
            console.log("Random numbers received from server:", numbers);
            numbers.forEach(location => {
                LOCATIONS.push(GAME_LOCATIONS[location]);
            });
        });

        connection.on("PlayerGuessed", (name, lat, lng, distance, actualDistance, points) => {
            GUESSES_TO_SHOW.push({
                name: name,
                lat: lat,
                lng: lng,
                distance: distance,
                actualDistance: actualDistance,
                points: points
            });
            if (OTHER_PEOPLE_GUESSES[name] == null) {
                OTHER_PEOPLE_GUESSES[name] = [];
            }
            OTHER_PEOPLE_GUESSES[name].push({
                lat: lat,
                lng: lng,
                distance: distance,
                actualDistance: actualDistance,
                points: points
            });
            if (GUESSED) {
                displayGuess(name, lat, lng, distance, points);
            }
            if (GUESSES_TO_SHOW.length == PLAYERCOUNT - 1 && IS_OWNER && GUESSED) {
                if (CURRENT_ROUND == TOTAL_ROUNDS) {
                    document.getElementById("breakdownButton").style.display = "block";
                } else {
                    document.getElementById("nextButton").style.display = "block";
                }
            }
        });

        connection.on("NextRound", () => {
            $("#nextButton").click();
        });

        connection.on("Breakdown", () => {
            $("#breakdownButton").click();
        });

        connection.on("GameStarted", (rounds) => {
          console.log(`Game started`);
          window.location.href = `play.html?multiplayer=true&rounds=${rounds}`;
        });

        await connection.start().catch(err => console.error("SignalR connection failed:", err)).then(() => {
          console.log("Connected to SignalR hub");
          connection.invoke("ResumeSession", stableUserId);
        });
        await connection.invoke("GetRandomNumbers", TOTAL_ROUNDS, TOTAL_LOCATIONS);
    } else {
        var locationIds = GetRandomNumbers(TOTAL_ROUNDS);
        locationIds.forEach(location => {
            LOCATIONS.push(GAME_LOCATIONS[location]);
        });
    }

    MAP = L.map('map', {
        renderer: L.canvas(),
        crs: L.CRS.Simple,
        center: CENTER,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        scrollWheelZoom: true,
        zoomControl: false
    }).setView(CENTER, -1);

    bounds = [new L.LatLngBounds(LAT_BOUNDS, LNG_BOUNDS)];

    L.imageOverlay(MAP_IMAGE, bounds, {
        }).addTo(MAP);

    MAP.fitBounds(bounds, {padding: [200, 200]});

    SIDEBAR = L.control.sidebar('sidebar', {
        position: 'left',
        closeButton: false
    });

    CURRENT_LOCATION = LOCATIONS[0];
    SIDEBAR.on('shown', function () {
        document.getElementById("image").src = `images/${SUBFOLDER}/${CURRENT_LOCATION["id"]}.jpg`; 
    });

    MAP.addControl(SIDEBAR);

    setTimeout(function () {
        SIDEBAR.show();
    }, 500);

    ISLAND_BOUNDS = [];
    ConfigureIslandBounds();

    $("#hintLocation").text(`Location ${1}/${TOTAL_ROUNDS}`);


    MAP.on('click', function(e) {
        if (PLACED_MARKER) {
            MAP.removeLayer(PLACED_MARKER);
        }

        PLACED_MARKER = new L.marker(e.latlng, {
            draggable: true,
            icon: L.icon({
                iconUrl: "images/icons/waypoint.png",
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            })
        }).addTo(MAP);

        if (DEBUG_MODE) {
            console.log(`X: ${e.latlng.lng}, Y: ${e.latlng.lat}`);
        }

        $("#submitButton").removeAttr('disabled');
    });
}

initializeGame().catch(err => console.error("Error initializing game:", err));

COLORS = [
    "#9a474b",
    "#4f94a2",
    "#cfa624",
];

function displayGuess(name, lat, lng, distance, points) {
    var correctCoordinates = [CURRENT_LOCATION["coordinates"][1], CURRENT_LOCATION["coordinates"][0]];

    var ind = OTHER_GUESSES.length / 2 % 4;

    OTHER_GUESSES.push(new L.marker([lat, lng], {
        interactive: false,
        icon: L.icon({
            iconUrl: `images/icons/waypoint${ind + 1}.png`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        })
    }).addTo(MAP));

    OTHER_GUESSES.push(L.polyline([[lat, lng], correctCoordinates], {
            color: COLORS[ind],
            weight: 6}).addTo(MAP));

    document.getElementById("guessText").innerHTML += `<br>${name} was <b>${distance}</b> away from the correct location, scoring <b>${points}</b> points.`;
}

$(document).ready(function() {
    $("#submitButton").click(function() {
        GUESSED = true;
        var markerCoordinates = PLACED_MARKER.getLatLng();

        var correctCoordinates = [CURRENT_LOCATION["coordinates"][1], CURRENT_LOCATION["coordinates"][0]];

        var distance = Math.round(MAP.distance(markerCoordinates, correctCoordinates));
        var checkDistance = distance;
        
        distance = GetReadableDistance(checkDistance);

        MAP.removeLayer(PLACED_MARKER);

        PLACED_MARKER = new L.marker(PLACED_MARKER.getLatLng(), {
            interactive: false,
            icon: L.icon({
                iconUrl: "images/icons/waypoint.png",
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            })
        }).addTo(MAP);

        CORRECT_MARKER = new L.marker(correctCoordinates, {
            interactive: true,
            icon: L.icon({
                iconUrl: "images/icons/destination.png",
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        }).addTo(MAP);


        // Points and result text needs to be reworked
        var zoom;
        var resultText;
        var duration;
        var points = 0;
        
        if (checkDistance < 200) {
            if (checkDistance < 50) {
                zoom = 2.0;
                resultText = checkDistance <= 25 ? "Got it!" : "Close";
                MAP.options.maxZoom = 3;
                duration = 0.5;
            } else {
                zoom = 1.5;
                resultText = "Right Area!";
                duration = 1;
            }
           
        } else {
            resultText = "Not quite!";
            zoom = 0;
            duration = 2.5
        }

        if (checkDistance <= 25) {
            points = 500;
        } else {
            points = 500 - Math.round((checkDistance * 1.45));

            if (points < 0) {
                points = 0;
            }
        }

        if (zoom == 0 && (GetIslandFromMarker(PLACED_MARKER) == GetIslandFromMarker(CORRECT_MARKER)) && !GTAV) {
            resultText += "<br><span id='right-island'>You were on the right Island, though!</span>";
        }

        MAP.flyTo(CORRECT_MARKER.getLatLng(), zoom, {
            duration: duration
        });

        DISTANCE_LINE = L.polyline([markerCoordinates, correctCoordinates], {
            color: "#577c58",
            weight: 6}).addTo(MAP);
            
        document.getElementById("resultText").innerHTML = resultText;
        document.getElementById("guessText").innerHTML = `<br>You were <b>${distance}</b> away from the correct location, scoring <b>${points}</b> points.`;

        GUESSES.push([PLACED_MARKER, CORRECT_MARKER, points]);

        if (MULTIPLAYER) {
            connection.invoke("SubmitGuess", parseInt(markerCoordinates.lat), parseInt(markerCoordinates.lng), distance, checkDistance, parseInt(points))
                .catch(err => console.error("Error submitting guess:", err));
        }

        for (var guess of GUESSES_TO_SHOW) {
            displayGuess(guess.name, guess.lat, guess.lng, guess.distance, guess.points);
        }

        document.getElementById("submitButton").style.display = "none";
        if (IS_OWNER && GUESSES_TO_SHOW.length == PLAYERCOUNT - 1) {
            if (CURRENT_ROUND == TOTAL_ROUNDS) {
                document.getElementById("breakdownButton").style.display = "block";
            } else {
                document.getElementById("nextButton").style.display = "block";
            }
        }
    });

    $("#nextButton").click(function() {
        GUESSED = false;
        for (var guess of OTHER_GUESSES) {
            MAP.removeLayer(guess);
        }
        OTHER_GUESSES = [];
        GUESSES_TO_SHOW = [];
        if (MULTIPLAYER && IS_OWNER) {
            connection.invoke("NextRound").catch(err => console.error("Error invoking NextRound:", err));
        }
        MAP.removeLayer(PLACED_MARKER);
        MAP.removeLayer(CORRECT_MARKER);
        MAP.removeLayer(DISTANCE_LINE);

        CURRENT_LOCATION = LOCATIONS[CURRENT_ROUND];
        CURRENT_ROUND++;

        $("#hintLocation").text(`Location ${CURRENT_ROUND}/${TOTAL_ROUNDS}`);

        MAP.flyTo([-4096, 4096], -2);
        
        document.getElementById("image").src = `images/locations-v/${CURRENT_LOCATION["id"]}.jpg`;    
        
        document.getElementById("resultText").innerHTML = "";
        document.getElementById("guessText").innerHTML = ""; 
        
        document.getElementById("nextButton").style.display = "none";
        document.getElementById("submitButton").style.display = "block";
        document.getElementById("submitButton").setAttribute('disabled', true);
    });

    $("#breakdownButton").click(function() {
        GUESSED = false;
        for (var guess of OTHER_GUESSES) {
            MAP.removeLayer(guess);
        }
        OTHER_GUESSES = [];
        GUESSES_TO_SHOW = [];
        if (MULTIPLAYER && IS_OWNER) {
            connection.invoke("Breakdown").catch(err => console.error("Error invoking Breakdown:", err));
        }
        MAP.flyTo([-4096, 4096], -2);

        document.getElementById("image").remove();
        
        document.getElementById("breakdownButton").style.display = "none";
        document.getElementById("resultText").innerHTML = "";
        document.getElementById("guessText").innerHTML = ""; 

        document.getElementById("breakdown").innerHTML = "BREAKDOWN";
        var bdc = document.getElementById("breakdown-content");
        bdc.style.display = "block";

        var timeLeft = 5;
        if (IS_OWNER) {
            document.getElementById("playAgainButton").style.display = "block";
            $("#playAgainButton").attr('disabled', 'true');
            $("#playAgainButton").html(`${timeLeft}...`);

            var buttonCountdown = setInterval(function() {            
                timeLeft--;

                if (timeLeft <= 0) {
                    clearInterval(buttonCountdown);
                    $("#playAgainButton").removeAttr('disabled');
                    $("#playAgainButton").html("play again!");
                    return;
                }

                $("#playAgainButton").html(`${timeLeft}...`);
            }, 1000);
        }

        // add new table for each player
        for (var player of PLAYERS) {
            if (player == localStorage.getItem("user_name")) {
                continue; // Skip the current player
            }
            $("#breakdown-content").append(
                `<h3>${player}'s guesses</h3>
                <table id="breakdown-table-${player}" class="table table-striped table-dark text-center table-hover">
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Correct Island</th>
                        <th scope="col">Distance Away</th>
                        <th scope="col">Right Area?</th>
                        <th scope="col">Points</th>
                    </tr>
                </thead>
                <tfoot>
				<tr>
					<th id="total-text" colspan="4"></span>Total:</th>
      				<td id="total-points-${player}"></td>
				  </tr>
			    </tfoot>
                </table>`);
        }

        guessCount = 0;
        totalPoints = 0;
        for (var i = 0; i < GUESSES.length; i++) {
            let guess = GUESSES[i];
            guessCount++;
            
            totalPoints += guess[2];

            var chosenCoordinates = guess[0].getLatLng();
            var correctCoordinates = guess[1].getLatLng();
    
            var locationDetails = GetLocationFromCoordinates(correctCoordinates);
            var actualDistance = Math.round(MAP.distance(chosenCoordinates, correctCoordinates));
            
            var readableDistance = GetReadableDistance(actualDistance);
       
            var chosenMarker = new L.marker(chosenCoordinates, {
                interactive: true,
                icon: L.icon({
                    iconUrl: "images/icons/waypoint.png",
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                })
            }).addTo(MAP);

            console.log(OTHER_PEOPLE_GUESSES);
            console.log(PLAYERS);

            var j = 0;
            for (var player of PLAYERS) {
                if (player == localStorage.getItem("user_name")) {
                    continue; // Skip the current player
                }
                var player_guess = OTHER_PEOPLE_GUESSES[player][i];
                OTHER_GUESSES.push(new L.marker([player_guess.lat, player_guess.lng], {
                    interactive: false,
                    icon: L.icon({
                        iconUrl: `images/icons/waypoint${(j % 4) + 1}.png`,
                        iconSize: [36, 36],
                        iconAnchor: [18, 18]
                    })
                }).addTo(MAP));
                OTHER_GUESSES.push(L.polyline([[player_guess.lat, player_guess.lng], correctCoordinates], {
                    color: COLORS[j % 4],
                    weight: 6}).addTo(MAP));

                $(`#breakdown-table-${player}`).append(
                    `
                    <tbody id="tableBody" class="align-middle">
                    <tr onmouseover="onRowHover(${guessCount})" onmouseleave="onRowLeave(${guessCount})" onmousedown="onRowClick(${guessCount})">
                    <th>${guessCount}</th>
                    <td>${locationIslandText}</td>
                    <td>${player_guess.distance}</td>
                    <td><span id='${player_guess.actualDistance <= 200 ? "correctIcon" : "incorrectIcon"}'>${player_guess.actualDistance <= 200 ? "\u2714" : "\u274C"}</span></td>
                    <td>${player_guess.points}</td>
                    </tr>                 
                    `);

                j++;
            }
    
            var locationMarker = new L.marker(correctCoordinates, {
                interactive: true,
                icon: L.icon({
                    iconUrl: "images/icons/destination.png",
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(MAP);
    
            ALL_MARKERS.push([chosenMarker, locationMarker]);
    
            var chosenIslandText = GetIslandFromMarker(chosenMarker);
            var locationIslandText = GetIslandFromMarker(locationMarker);
            
            var icon = "<span id='incorrectIcon'>\u274C</span>";
            if (actualDistance <= 200) {
                icon = "<span id='correctIcon'>\u2714</span>";
            }
    
            $("#breakdown-table").append(
                `
                <tbody id="tableBody" class="align-middle">
                <tr onmouseover="onRowHover(${guessCount})" onmouseleave="onRowLeave(${guessCount})" onmousedown="onRowClick(${guessCount})">
                <th>${guessCount}</th>
                <td>${locationIslandText}</td>
                <td>${readableDistance}</td>
                <td>${icon}</td>
                <td>${guess[2]}</td>
                </tr>                 
                `);
                            
            chosenMarker.bindTooltip(`Guess ${guessCount}, ${readableDistance} away [<b>${guess[2]}</b> points].`);
            locationMarker.bindTooltip(`Guess ${guessCount}, ${readableDistance} away.<br><img id="tooltip-image" src="images/locations-v/${locationDetails.id}.jpg" /><br><span id="tooltip-location">${locationDetails.description}.<br><span id="tooltip-location-points"<b>${guess[2]}</b> points.</span></span>`, {
                opacity: 1,
                direction: "right",
                
            });
            POLY_LINES.push({
                id: guessCount,
                line: L.polyline([guess[0].getLatLng(), guess[1].getLatLng()], {color: "#577c58", weight: 6}).addTo(MAP)
            });               
        }


        $("#total-points").html(`${totalPoints}/${TOTAL_ROUNDS * 500}`);
        for (var player of PLAYERS) {
            if (player == localStorage.getItem("user_name")) {
                continue; // Skip the current player
            }
            var totalPoints = 0;
            for (var guess of OTHER_PEOPLE_GUESSES[player]) {
                totalPoints += guess.points;
            }
            $(`#total-points-${player}`).html(`${totalPoints}/${TOTAL_ROUNDS * 500}`);
        }

        document.getElementById("sidebar").style.width = "25vw";
        document.getElementById("hintBox").style.height = "2.5vh";
        document.getElementById("hintText").innerHTML = "Hover over a marker to view details.";

        var bestGame = GetBestGame(TOTAL_ROUNDS);

        if (bestGame != null) {
            // User has played with this many rounds before
            if (totalPoints > bestGame.score) {
                // New high score!
                $("#high-score").html("NEW HIGHSCORE!");
            }
        }       

        var currentDate = Date.now() / 1000;

        RECENT_GAMES.push({
            startDate: START_DATE,
            rounds: GUESSES.length,
            endDate: currentDate,
            score: totalPoints
        });

        localStorage.setItem("recentGames", JSON.stringify(RECENT_GAMES));
    });

    $("#playAgainButton").click(function() {
        if (MULTIPLAYER) {
            connection.invoke("StartGame", 5).catch(err => console.error("StartGame failed:", err));
        }
        else {
            window.location.reload();
        }
    });

    $("#exitButton").click(function() { 
        window.location.href="index.html";
    });
});

var HIDDEN_LINES;
HIDDEN_LINES = [];
var HIDDEN_MARKERS;
HIDDEN_MARKERS = [];

function onRowHover(id) {
    
    POLY_LINES[id-1].line.setStyle({
        color: "#699f6a"
    });  

}

function onRowLeave(id) { 
    for (i = 0; i < HIDDEN_LINES.length; i++) {
        MAP.addLayer(HIDDEN_LINES[i]);      
    }

    for (j = 0; j < HIDDEN_MARKERS.length; j++) {
        MAP.addLayer(HIDDEN_MARKERS[j][0]);
        MAP.addLayer(HIDDEN_MARKERS[j][1]);
    }

    HIDDEN_LINES = [];
    HIDDEN_MARKERS = [];

    POLY_LINES[id-1].line.setStyle({
        color: "#577c58"
    });
}

function onRowClick(id) {

    /* To fix
    
    for (i = 0; i < POLY_LINES.length; i++) {  
        HIDDEN_LINES.push(POLY_LINES[i].line);
        HIDDEN_MARKERS.push(ALL_MARKERS[i]);
    }  

    for (j = 0; j < HIDDEN_LINES.length; j++) {
        if (HIDDEN_LINES[j] != POLY_LINES[id-1].line) {
            MAP.removeLayer(HIDDEN_LINES[j]);        
        }
    }

    for (k = 0; k < HIDDEN_MARKERS.length; k++) {
        if (HIDDEN_MARKERS[k] != ALL_MARKERS[id-1]) {
            MAP.removeLayer(HIDDEN_MARKERS[k][0]);
            MAP.removeLayer(HIDDEN_MARKERS[k][1]);
        }
    }
    */


    MAP.flyToBounds(POLY_LINES[id-1].line.getBounds(), {maxZoom: 1});
}