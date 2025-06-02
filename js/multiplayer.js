const connection = new signalR.HubConnectionBuilder()
  .withUrl("https://gtaivbackend.kran.gg/hub")
  .configureLogging(signalR.LogLevel.Information)
  .build();

let myUserId = null;
let stableUserId = localStorage.getItem("stable_id") || null;
if (!stableUserId) {
    stableUserId = crypto.randomUUID();
    localStorage.setItem("stable_id", stableUserId);
}

// Run after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Generate random background image
  document.body.style.backgroundImage = `url("images/locations/${GetRandomNumber()}.jpg")`; 
  
    // Get UI elements
  const nameInput = document.getElementById("name-input");
  const nameStatus = document.getElementById("name-status");
  const createRoomName = document.getElementById("create-room-name");
  const createRoomPassword = document.getElementById("create-room-password");
  const createStatus = document.getElementById("create-status");
  const joinRoomName = document.getElementById("join-room-name");
  const joinRoomPassword = document.getElementById("join-room-password");
  const joinStatus = document.getElementById("join-status");
  const roomInfo = document.getElementById("room-info");
  const roomNameEl = document.getElementById("room-name");
  const roomPlayers = document.getElementById("room-players");

  // SignalR event handlers
  connection.on("NameSet", (name) => {
    localStorage.setItem("user_name", name);
    nameStatus.textContent = `Your name is set to ${name}.`;
  });
  
  connection.on("RoomCreated", (roomName) => {
    createStatus.textContent = "Room created!";
    const name = localStorage.getItem("user_name");
    const players = name ? [name] : [];
    showRoom(roomName, players, true);
  });
  
  connection.on("RoomJoined", (roomName, players, isOwner) => {
    joinStatus.textContent = "Successfully joined room.";
    showRoom(roomName, players, isOwner);
  });

  connection.on("PlayerJoined", (name) => {
    const li = document.createElement("li");
    li.textContent = name;
    roomPlayers.appendChild(li);
  });

  connection.on("GameStarted", (rounds) => {
    roomInfo.style.display = "none";
    // Redirect to game page or start game logic
    console.log(`Game started`);
    window.location.href = `play.html?multiplayer=true&rounds=${rounds}`;
  });

  connection.on("Error", (msg) => {
    console.error("Server error:", msg);
    [nameStatus, createStatus, joinStatus].forEach(el => {
      if (el && el.textContent === "") el.textContent = msg;
    });
  });

  connection.on("KeepAlive", () => {
    // Keep-alive message received, no action needed
  });

  // Helper to show room info
  function showRoom(roomName, players, isOwner) {
    roomNameEl.textContent = roomName;
    roomPlayers.innerHTML = "";
    players.forEach(p => {
      const li = document.createElement("li");
      li.textContent = p;
      roomPlayers.appendChild(li);
    });
    if (isOwner) {
      // add "Start Game" button if owner
      const startButton = document.createElement("button");
      startButton.textContent = "Start Game";
      startButton.onclick = () => {
        connection.invoke("StartGame", 5).catch(err => console.error("StartGame failed:", err));
      };
      roomInfo.appendChild(startButton);
    }
    const leaveButton = document.createElement("button");
    leaveButton.textContent = "Leave Room";
    leaveButton.onclick = () => {
      connection.invoke("LeaveRoom").catch(err => console.error("LeaveRoom failed:", err));
      roomInfo.style.display = "none";
    };
    roomInfo.appendChild(leaveButton);
    roomInfo.style.display = "block";
  }

  // Button handlers
  window.setName = async function () {
    try {
      await connection.invoke("SetName", nameInput.value, stableUserId);
    } catch (err) {
      console.error("SetName failed:", err);
    }
  };

  window.createRoom = async function () {
    try {
      await connection.invoke("CreateRoom", createRoomName.value, createRoomPassword.value, stableUserId);
    } catch (err) {
      console.error("CreateRoom failed:", err);
    }
  };

  window.joinRoom = async function () {
    try {
      await connection.invoke("JoinRoom", joinRoomName.value, joinRoomPassword.value);
    } catch (err) {
      console.error("JoinRoom failed:", err);
    }
  };

  // Connect to hub
  connection.start().catch(err => console.error("SignalR connection failed:", err)).then(() => {
    console.log("Connected to SignalR hub");
    connection.invoke("ResumeSession", stableUserId);
  });
});
