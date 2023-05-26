// Importer les modules nécessaires
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Initialiser l'application et le serveur HTTP
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Définir les objets pour stocker les données des rooms
const rooms = new Map();

// Définir le répertoire des fichiers statiques
const publicPath = path.join(__dirname, 'public');

app.get('/rooms', (req, res) => {
    const room = createRoom();
    rooms.set(room.url, room);
    app.use(`/${room.url}`, express.static(publicPath));

    console.log(`New room created: http://localhost:3000/${room.url}`);
    res.send(room.url);
});

// Gérer la connexion des clients
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Rejoindre une room en fonction de l'URL
    socket.on('joinRoom', (url) => {
        const room = rooms.get(url);
        if (room) {
            // Rejoindre la room correspondante
            socket.join(url);

            if (room.hostSocketId === null) {
                room.hostSocketId = socket.id;
                console.log('Server host: ' + room.hostSocketId);
            }

            socket.emit('joinedRoom', {
                url: room.url,
                hostSocketId: room.hostSocketId
            });
            socket.emit('initialTimer', room.timerValue);             
            socket.emit('timerStatus',  room.isTimerRunning);
        } else {
            socket.on('roomNotFound', (errorMessage) => {
                document.getElementById('errorMessage').innerText = errorMessage;
            });
        }
    });

    // Gérer les déconnexions des clients
    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);

        // Vérifier si le client déconnecté est l'hôte d'une room
        for (const room of rooms.values()) {
            if (room.hostSocketId === socket.id) {
                io.to(room.url).emit('roomClosed');
                rooms.delete(room.url);
                break;
            }
        }
    });

    // Gérer la demande de pause du chronomètre
    socket.on('pauseTimer', () => {
        const room = getRoomBySocketId(socket.id);
        if (room && socket.id === room.hostSocketId) {
            room.isTimerRunning = !room.isTimerRunning;
            io.to(room.url).emit('timerStatus', room.isTimerRunning);
        }
    });
});

// Démarrer le serveur
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log('Server started on port', port);
});

// Mettre à jour le chronomètre toutes les secondes pour chaque room active
setInterval(() => {
    for (const room of rooms.values()) {
        if (room.isTimerRunning) {
            room.timerValue++;
            io.to(room.url).emit('timerUpdate', room.timerValue);
        }
    }
}, 1000);

function generateUrl() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    let url = '';

    for (let i = 0; i < 3; i++) {
        const word = Array.from({ length: 3 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
        url += word + '-';
    }

    url = url.slice(0, -1); // Supprimer le dernier tiret "-"
    return url;
}

function createRoom() {
    let isUnique = false;
    let url = '';

    while (!isUnique) {
        url = generateUrl();
        isUnique = !rooms.has(url);
    }

    const room = {
        url: url,
        hostSocketId: null,
        isTimerRunning: true,
        timerValue: 0
    };

    return room;
}

// Obtenir les données de la room en fonction de l'ID du socket
function getRoomBySocketId(socketId) {
    for (const [url, room] of rooms) {
        if (room.hostSocketId === socketId || io.sockets.adapter.rooms.get(url)?.has(socketId)) {
            return room;
        }
    }
    return null;
}