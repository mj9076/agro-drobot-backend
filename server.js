// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    // MODIFIED: Allow both localhost and your specific network IP for the React app
    origin: ["http://localhost:3000", "http://192.168.0.94:3000"], 
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors({
  // MODIFIED: Allow both localhost and your specific network IP for Express routes
  origin: ["http://localhost:3000", "http://192.168.0.94:3000"],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// --- In-memory storage for latest sensor data ---
let latestSensorData = {
  temperature: "--", humidity: "--", rainfall: "--", soil_moisture: "--",
  ultrasonic: "--", acceleration: "--", motion: "None",
  latitude: 31.4677, longitude: 74.2728,
  n: 80, p: 40, k: 60, ph: 6.5,
  diseaseName: "N/A", diseaseConfidence: "N/A", yieldPredicted: "N/A",
  yieldRecommendations: "N/A", weedDetection: "N/A",
  timestamp: new Date().toISOString()
};

// --- In-memory command queue for ESP32 ---
let commandQueue = [];

// --- HTTP POST Endpoint for ESP32 to publish data ---
app.post('/api/sensor-data', (req, res) => {
  const newData = req.body;
  console.log('Received data from ESP32:', newData);

  let updatedSensorData = { ...latestSensorData };
  if (newData.temperature !== undefined) updatedSensorData.temperature = parseFloat(newData.temperature).toFixed(2);
  if (newData.humidity !== undefined) updatedSensorData.humidity = parseFloat(newData.humidity).toFixed(2);
  if (newData.rainfall !== undefined) updatedSensorData.rainfall = newData.rainfall;
  if (newData.soil_moisture !== undefined) updatedSensorData.soil_moisture = parseFloat(newData.soil_moisture).toFixed(2);
  if (newData.ultrasonic !== undefined) updatedSensorData.ultrasonic = parseFloat(newData.ultrasonic).toFixed(2);
  if (newData.acceleration !== undefined) updatedSensorData.acceleration = parseFloat(newData.acceleration).toFixed(2);
  if (newData.motion !== undefined) {
    const motionValue = String(newData.motion).toLowerCase();
    updatedSensorData.motion = (motionValue === "1" || motionValue === "true" || motionValue === "detected") ? "Detected" : "None";
  }
  if (newData.latitude !== undefined && newData.longitude !== undefined) {
    updatedSensorData.latitude = parseFloat(newData.latitude);
    updatedSensorData.longitude = parseFloat(newData.longitude);
  }
  if (newData.n !== undefined) updatedSensorData.n = parseFloat(newData.n);
  if (newData.p !== undefined) updatedSensorData.p = parseFloat(newData.p);
  if (newData.k !== undefined) updatedSensorData.k = parseFloat(newData.k);
  if (newData.ph !== undefined) updatedSensorData.ph = parseFloat(newData.ph);
  if (newData.diseaseName !== undefined) updatedSensorData.diseaseName = newData.diseaseName;
  if (newData.diseaseConfidence !== undefined) updatedSensorData.diseaseConfidence = newData.diseaseConfidence;
  if (newData.yieldPredicted !== undefined) updatedSensorData.yieldPredicted = newData.yieldPredicted;
  if (newData.yieldRecommendations !== undefined) updatedSensorData.yieldRecommendations = newData.yieldRecommendations;
  if (newData.weedDetection !== undefined) updatedSensorData.weedDetection = newData.weedDetection;

  updatedSensorData.timestamp = new Date().toISOString();
  latestSensorData = updatedSensorData;

  io.emit('sensorDataUpdate', latestSensorData);
  console.log('Broadcasted data to dashboard:', latestSensorData);

  res.status(200).json({ message: 'Data received and broadcasted', data: latestSensorData });
});

// --- HTTP GET Endpoint for ESP32 to poll for commands ---
app.get('/api/commands', (req, res) => {
  if (commandQueue.length > 0) {
    const commandToSend = commandQueue.shift();
    console.log('Sending command to ESP32 via HTTP poll:', commandToSend);
    res.status(200).json(commandToSend);
  } else {
    res.status(200).json({ command: "NONE" });
  }
});

// --- Socket.IO connection handling ---
io.on('connection', (socket) => {
  console.log(`A client connected: ${socket.id}`);
  socket.emit('sensorDataUpdate', latestSensorData);

  // Handle commands from the dashboard (e.g., 'sendCommand')
  socket.on('sendCommand', (commandPayload) => {
    console.log(`Command received from dashboard (${socket.id}):`, commandPayload);
    commandQueue.push(commandPayload);
    console.log('Command added to queue. Current queue:', commandQueue);
    socket.emit('commandStatus', { success: true, message: `Command '${commandPayload.command}' received by server and queued.` });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// --- Start the server ---
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ESP32 posts data to: http://192.168.0.94:${PORT}/api/sensor-data`); // Updated IP for console log
  console.log(`ESP32 polls commands from: http://192.168.0.94:${PORT}/api/commands`); // Updated IP for console log
  console.log(`React app connects to Socket.IO at ws://192.168.0.94:${PORT} (or ws://localhost:${PORT})`); // Clarified for console log
});