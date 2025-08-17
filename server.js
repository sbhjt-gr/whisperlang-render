const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { PeerServer } = require('peer');
const { v4: uuidv4 } = require('uuid');

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
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: false
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

let users = {};
let rooms = {};

// Helper function to generate meeting ID
function generateMeetingId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', (username) => {
    console.log('User registered:', username);
    users[socket.id] = {
      id: socket.id,
      username: username,
      peerId: null,
      roomId: null
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

  // Create a new meeting room
  socket.on('create-meeting', (callback) => {
    const meetingId = generateMeetingId();
    const user = users[socket.id];
    
    if (user) {
      rooms[meetingId] = {
        id: meetingId,
        host: user,
        participants: [user],
        created: new Date(),
        active: true
      };
      
      user.roomId = meetingId;
      socket.join(meetingId);
      
      console.log(`Meeting created: ${meetingId} by ${user.username}`);
      callback({ success: true, meetingId: meetingId });
    } else {
      callback({ success: false, error: 'User not registered' });
    }
  });

  // Join an existing meeting room
  socket.on('join-meeting', (meetingId, callback) => {
    const user = users[socket.id];
    const room = rooms[meetingId];
    
    if (!user) {
      callback({ success: false, error: 'User not registered' });
      return;
    }
    
    if (!room) {
      callback({ success: false, error: 'Meeting not found' });
      return;
    }
    
    if (!room.active) {
      callback({ success: false, error: 'Meeting has ended' });
      return;
    }
    
    // Add user to room
    room.participants.push(user);
    user.roomId = meetingId;
    socket.join(meetingId);
    
    console.log(`${user.username} joined meeting: ${meetingId}`);
    
    // Notify existing participants
    socket.to(meetingId).emit('user-joined', user);
    
    // Send current participants to new user
    callback({ 
      success: true, 
      meetingId: meetingId,
      participants: room.participants.filter(p => p.id !== socket.id)
    });
  });

  // Leave meeting
  socket.on('leave-meeting', () => {
    const user = users[socket.id];
    if (user && user.roomId) {
      const room = rooms[user.roomId];
      if (room) {
        // Remove user from room
        room.participants = room.participants.filter(p => p.id !== socket.id);
        socket.to(user.roomId).emit('user-left', user);
        socket.leave(user.roomId);
        
        // If host leaves or room is empty, end the meeting
        if (room.participants.length === 0 || room.host.id === socket.id) {
          room.active = false;
          socket.to(user.roomId).emit('meeting-ended');
          console.log(`Meeting ${user.roomId} ended`);
        }
        
        user.roomId = null;
      }
    }
  });

  // WebRTC signaling for room-based calls
  socket.on('offer', (data) => {
    const { targetPeerId, offer, meetingId } = data;
    const user = users[socket.id];
    
    if (user && user.roomId === meetingId) {
      socket.to(meetingId).emit('offer', {
        offer: offer,
        fromPeerId: user.peerId,
        fromUsername: user.username
      });
    }
  });

  socket.on('answer', (data) => {
    const { targetPeerId, answer, meetingId } = data;
    const user = users[socket.id];
    
    if (user && user.roomId === meetingId) {
      socket.to(meetingId).emit('answer', {
        answer: answer,
        fromPeerId: user.peerId,
        fromUsername: user.username
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { targetPeerId, candidate, meetingId } = data;
    const user = users[socket.id];
    
    if (user && user.roomId === meetingId) {
      socket.to(meetingId).emit('ice-candidate', {
        candidate: candidate,
        fromPeerId: user.peerId,
        fromUsername: user.username
      });
    }
  });

  // Legacy call handling (for backward compatibility)
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
    const user = users[socket.id];
    
    // Leave meeting if in one
    if (user && user.roomId) {
      const room = rooms[user.roomId];
      if (room) {
        room.participants = room.participants.filter(p => p.id !== socket.id);
        socket.to(user.roomId).emit('user-left', user);
        
        // End meeting if host disconnects or room is empty
        if (room.participants.length === 0 || room.host.id === socket.id) {
          room.active = false;
          socket.to(user.roomId).emit('meeting-ended');
        }
      }
    }
    
    delete users[socket.id];
    socket.broadcast.emit('users-change', Object.values(users));
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'WhisperLang WebRTC Signaling Server',
    status: 'Running',
    users: Object.keys(users).length,
    rooms: Object.keys(rooms).length,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    users: Object.keys(users).length,
    rooms: Object.keys(rooms).length,
    uptime: process.uptime()
  });
});

// API endpoint to get meeting info
app.get('/meeting/:id', (req, res) => {
  const meetingId = req.params.id;
  const room = rooms[meetingId];
  
  if (!room) {
    return res.status(404).json({ error: 'Meeting not found' });
  }
  
  res.json({
    id: room.id,
    active: room.active,
    participantCount: room.participants.length,
    created: room.created
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`WebRTC signaling server ready`);
});