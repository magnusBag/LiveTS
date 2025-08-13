// Quick test script to verify WebSocket connectivity
const WebSocket = require('ws');

console.log('Testing WebSocket connection to LiveTS...');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  
  // Send a test event
  const testEvent = {
    type: 'event',
    componentId: 'test-component',
    eventName: 'test',
    payload: { test: 'data' }
  };
  
  console.log('📤 Sending test event:', testEvent);
  ws.send(JSON.stringify(testEvent));
  
  setTimeout(() => {
    ws.close();
  }, 1000);
});

ws.on('message', (data) => {
  console.log('📥 Received message:', data.toString());
});

ws.on('close', () => {
  console.log('🔌 WebSocket connection closed');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
  process.exit(1);
});