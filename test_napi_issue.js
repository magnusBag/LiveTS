// Minimal test to reproduce the NAPI threadsafe function issue
const { LiveTsWebSocketBroker } = require('./packages/rust-core');

console.log('🧪 Testing NAPI threadsafe function...');

try {
  const broker = new LiveTsWebSocketBroker();

  console.log('✅ Broker created successfully');

  // Set up event handler with detailed logging
  broker.setEventHandler((...args) => {
    console.log('🎯 JavaScript callback received args:', args);
    console.log('🎯 Number of arguments:', args.length);
    if (args.length > 0) {
      console.log('🎯 First arg type:', typeof args[0]);
      console.log('🎯 First arg value:', args[0]);
    }
  });

  console.log('✅ Event handler set successfully');

  // Start the broker to trigger events
  broker.listen('127.0.0.1', 9999);
  console.log('✅ Broker listening on port 9999');

  // Keep the process alive for testing
  setTimeout(() => {
    console.log('🛑 Stopping test...');
    broker.stop();
    process.exit(0);
  }, 5000);
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
