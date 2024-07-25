const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/town-aint-big-enough', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Player schema and model
const playerSchema = new mongoose.Schema({
  name: String,
  townCode: String,
  role: String,
});

const Player = mongoose.model('Player', playerSchema);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// WebSocket connection
wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    console.log('received: %s', message);
  });
});

// Function to broadcast a message to all connected clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/start-game', (req, res) => {
  res.render('start-game');
});

app.post('/start-new-game', async (req, res) => {
  const { townName, playerName } = req.body;
  let townCode = townName;
  let suffix = 1;

  // Ensure unique town code
  while (await Player.findOne({ townCode })) {
    townCode = `${townName}${suffix}`;
    suffix++;
  }

  const player = new Player({ name: playerName, townCode });
  await player.save();
  res.redirect(`/waiting/${townCode}?host=true&playerName=${playerName}`);
});

app.get('/join-town', (req, res) => {
  res.render('join');
});

app.post('/join', async (req, res) => {
  const { townCode, playerName } = req.body;

  // Ensure unique player name within the town
  const existingPlayer = await Player.findOne({ townCode, name: playerName });
  if (existingPlayer) {
    return res.send('Player name already exists in this town. Please choose another name.');
  }

  const player = new Player({ name: playerName, townCode });
  await player.save();
  res.redirect(`/waiting/${townCode}?playerName=${playerName}`);
});

app.get('/waiting/:townCode', async (req, res) => {
  const { townCode } = req.params;
  const { playerName } = req.query;
  const players = await Player.find({ townCode });
  const playerNames = players.map(player => player.name);
  const message = players.length < 5 ? 'Waiting for more players to join (minimum 5).' : '';
  const isHost = req.query.host === 'true';
  res.render('waiting', { players: playerNames, townCode, message, isHost, playerName });
});

app.get('/api/players/:townCode', async (req, res) => {
  const { townCode } = req.params;
  const players = await Player.find({ townCode });
  res.json(players);
});

app.post('/start/:townCode', async (req, res) => {
  const { townCode } = req.params;
  const players = await Player.find({ townCode });
  if (players.length < 5 || players.length > 10) {
    res.send('The game requires between 5 and 10 players.');
    return;
  }

  const roles = ['Sheriff', `${townCode}'s Most Wanted`, 'Snake Oil Salesman', 'Barber', 'Barkeep', 'Town Drunk', 'Gambler', 'Schoolteacher', 'Rancher', 'Mayor', 'Banker', 'Blacksmith', 'Doctor', 'Tracker'];
  const shuffledRoles = roles.sort(() => Math.random() - 0.5).slice(0, players.length);

  players.forEach((player, index) => {
    player.role = shuffledRoles[index];
    player.save();
  });

  const sheriff = players.find(p => p.role === 'Sheriff');
  const mostWanted = players.find(p => p.role.includes('Most Wanted'));

  if (!sheriff || !mostWanted) {
    res.send('Error: Roles not assigned correctly. Please try again.');
    return;
  }

  broadcast(JSON.stringify({ action: 'startGame', townCode }));

  res.json({ message: 'Game started', townCode });
});

app.get('/game-started/:townCode/:playerName', async (req, res) => {
  const { townCode, playerName } = req.params;
  const players = await Player.find({ townCode });
  const player = players.find(p => p.name === playerName);
  const sheriff = players.find(p => p.role === 'Sheriff');
  const mostWanted = players.find(p => p.role.includes('Most Wanted'));

  // Debugging logs
  console.log('Player:', player);
  console.log('Sheriff:', sheriff);
  console.log('Most Wanted:', mostWanted);

  if (!player || !sheriff || !mostWanted) {
    res.status(500).send("Game state invalid. Missing player, sheriff, or most wanted.");
    return;
  }

  res.render('game-started', { player, sheriff, mostWanted, townCode });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app;