# WhisperLang Server

This is the WebRTC signaling server for WhisperLang, built with Socket.IO and Express. It handles user registration, call signaling, and includes a PeerJS server for WebRTC peer connections.

## Deployment on Render

To deploy this server on Render for free, follow these steps:

1. Push this server code to a GitHub repository
2. Go to [render.com](https://render.com) and sign up with your GitHub account
3. Click "New" and select "Web Service"
4. Connect your GitHub repository containing this server code
5. Configure the deployment settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

The server will be automatically deployed and you'll get a URL like `https://your-app-name.onrender.com`

## Environment Variables

No environment variables are required for basic functionality. The server will use:
- PORT: Automatically set by Render
- Default port 3000 for local development

## Endpoints

- `GET /` - Server status and information
- `GET /health` - Health check endpoint
- Socket.IO connection for WebRTC signaling
- PeerJS server at `/peerjs` path

## Local Development

To run locally:

```bash
npm install
npm run dev
```

The server will run on http://localhost:3000

## What This Server Does

This server handles all the WebRTC signaling required for WhisperLang video calls including user registration, call initiation, call acceptance/rejection, and connection management. It also includes a built-in PeerJS server for handling the actual peer-to-peer connections.