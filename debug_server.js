// Quick debug script to test the server
const { spawn } = require('child_process');

console.log('Starting LiveTS server for debugging...');

const server = spawn('npm', ['run', 'dev'], {
  cwd: '/Users/mba/Documents/LiveTS/examples/counter',
  stdio: 'inherit'
});

// Give server time to start
setTimeout(async () => {
  console.log('\n🔍 Testing server response...');
  
  try {
    const http = require('http');
    const response = await new Promise((resolve, reject) => {
      http.get('http://localhost:3000', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ text: () => data }));
      }).on('error', reject);
    });
    const html = response.text();
    
    console.log('\n📄 HTML Response (first 500 chars):');
    console.log(html.substring(0, 500));
    
    console.log('\n🔍 Looking for component ID...');
    if (html.includes('data-livets-id')) {
      console.log('✅ Component ID found!');
      const match = html.match(/data-livets-id="([^"]+)"/);
      if (match) {
        console.log('🎯 Component ID:', match[1]);
      }
    } else {
      console.log('❌ Component ID missing');
    }
    
    console.log('\n🔍 Looking for count value...');
    const countMatch = html.match(/<div class="[^"]*text-4xl[^"]*">([^<]*)</);
    if (countMatch) {
      console.log('🎯 Count value:', `"${countMatch[1]}"`);
    }
    
  } catch (error) {
    console.error('❌ Error testing server:', error.message);
  }
  
  server.kill();
  process.exit(0);
}, 5000);

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});