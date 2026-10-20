#!/usr/bin/env node

/**
 * Network Access Control Test Script
 * Tests the backend server's network validation endpoints
 */

import http from 'http';

const API_BASE = 'http://localhost:3001';

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
    }

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing HealthGuard AI Network Access Control\n');
  console.log('=' .repeat(60));

  // Test 1: Health Check
  console.log('\n📋 Test 1: Health Check');
  try {
    const result = await makeRequest('/health');
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 2: Network Validation (Valid)
  console.log('\n📋 Test 2: Network Validation (Valid SSID)');
  try {
    const result = await makeRequest('/api/validate-network', 'POST', {
      ssid: 'Hospital-WiFi',
      location: { lat: 40.7128, lng: -74.0060 }
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 3: Network Validation (Invalid SSID)
  console.log('\n📋 Test 3: Network Validation (Invalid SSID)');
  try {
    const result = await makeRequest('/api/validate-network', 'POST', {
      ssid: 'Public-WiFi',
      location: { lat: 40.7128, lng: -74.0060 }
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 4: Network Validation (Invalid Location)
  console.log('\n📋 Test 4: Network Validation (Invalid Location)');
  try {
    const result = await makeRequest('/api/validate-network', 'POST', {
      ssid: 'Hospital-WiFi',
      location: { lat: 0, lng: 0 }
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 5: Register Doctor
  console.log('\n📋 Test 5: Register Doctor');
  try {
    const result = await makeRequest('/api/auth/register', 'POST', {
      email: 'test-doctor@hospital.com',
      password: 'test123',
      role: 'doctor',
      name: 'Dr. Test',
      ssid: 'Hospital-WiFi'
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 6: Register Patient
  console.log('\n📋 Test 6: Register Patient');
  try {
    const result = await makeRequest('/api/auth/register', 'POST', {
      email: 'test-patient@email.com',
      password: 'test123',
      role: 'patient',
      name: 'Test Patient',
      location: { lat: 40.7128, lng: -74.0060 }
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 7: Login Doctor (Valid)
  console.log('\n📋 Test 7: Login Doctor (Valid)');
  try {
    const result = await makeRequest('/api/auth/login', 'POST', {
      email: 'test-doctor@hospital.com',
      password: 'test123',
      ssid: 'Hospital-WiFi'
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 8: Login Doctor (Invalid SSID)
  console.log('\n📋 Test 8: Login Doctor (Invalid SSID)');
  try {
    const result = await makeRequest('/api/auth/login', 'POST', {
      email: 'test-doctor@hospital.com',
      password: 'test123',
      ssid: 'Public-WiFi'
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 9: Login Patient (Valid)
  console.log('\n📋 Test 9: Login Patient (Valid)');
  try {
    const result = await makeRequest('/api/auth/login', 'POST', {
      email: 'test-patient@email.com',
      password: 'test123',
      location: { lat: 40.7128, lng: -74.0060 }
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // Test 10: Login Patient (Invalid Location)
  console.log('\n📋 Test 10: Login Patient (Invalid Location)');
  try {
    const result = await makeRequest('/api/auth/login', 'POST', {
      email: 'test-patient@email.com',
      password: 'test123',
      location: { lat: 0, lng: 0 }
    });
    console.log('✅ Status:', result.status);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Tests Complete!\n');
  console.log('💡 Make sure the server is running on port 3001');
  console.log('💡 Start server: cd server && npm start\n');
}

runTests().catch(console.error);
