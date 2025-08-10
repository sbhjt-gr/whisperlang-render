const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { PeerServer } = require('peer');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

app.use(express.json());

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const peerServer = PeerServer({
  port: 9000,
  path: '/peerjs',
  proxied: true,
  allow_discovery: true,
});

let users = {};
let rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', (username) => {
    console.log('User registered:', username);
    users[socket.id] = {
      id: socket.id,
      username: username,
      peerId: null
    };
    
    socket.broadcast.emit('users-change', Object.values(users));
    socket.emit('users-change', Object.values(users));
  });

  socket.on('set-peer-id', (peerId) => {
    console.log('Peer ID set:', peerId, 'for user:', socket.id);
    if (users[socket.id]) {
      users[socket.id].peerId = peerId;
      
      socket.broadcast.emit('users-change', Object.values(users));
      socket.emit('users-change', Object.values(users));
    }
  });

  socket.on('call', (targetUsername) => {
    console.log('Call initiated to:', targetUsername);
    const caller = users[socket.id];
    const target = Object.values(users).find(user => user.username === targetUsername);
    
    if (target && caller) {
      if (target.peerId) {
        io.to(target.id).emit('call', caller);
        console.log('Call forwarded to:', target.username);
      } else {
        socket.emit('not-available', targetUsername);
      }
    } else {
      socket.emit('not-available', targetUsername);
    }
  });

  socket.on('accept-call', (callerUsername) => {
    console.log('Call accepted by:', users[socket.id]?.username, 'from:', callerUsername);
    const accepter = users[socket.id];
    const caller = Object.values(users).find(user => user.username === callerUsername);
    
    if (caller && accepter) {
      io.to(caller.id).emit('accepted-call', accepter);
    }
  });

  socket.on('reject-call', (callerUsername) => {
    console.log('Call rejected by:', users[socket.id]?.username, 'from:', callerUsername);
    const rejecter = users[socket.id];
    const caller = Object.values(users).find(user => user.username === callerUsername);
    
    if (caller && rejecter) {
      io.to(caller.id).emit('rejected-call', rejecter);
    }
  });

  socket.on('end-call', (targetUsername) => {
    console.log('Call ended by:', users[socket.id]?.username, 'to:', targetUsername);
    const caller = users[socket.id];
    const target = Object.values(users).find(user => user.username === targetUsername);
    
    if (target && caller) {
      io.to(target.id).emit('call-ended', caller);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete users[socket.id];
    socket.broadcast.emit('users-change', Object.values(users));
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'WhisperLang WebRTC Signaling Server',
    status: 'Running',
    users: Object.keys(users).length,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    users: Object.keys(users).length,
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
const PEER_PORT = process.env.PEER_PORT || 9000;

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`PeerJS server running on port ${PEER_PORT}`);
});