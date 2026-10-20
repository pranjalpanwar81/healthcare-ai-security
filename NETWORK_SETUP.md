# Network-Based Access Control Setup Guide

This guide explains how to set up and use the network-based access control system for HealthGuard AI.

## Overview

The system implements:
- **TCP/IP Network Validation**: Restricts access based on IP ranges
- **Wi-Fi SSID Validation**: Doctors must connect to hospital Wi-Fi
- **Location-based Access**: Patients must be at healthcare facility
- **Role-based Views**: Separate interfaces for doctors and patients

## Architecture

```
┌─────────────────┐
│   Frontend      │
│  (React App)    │
└────────┬────────┘
         │
         │ HTTP/HTTPS
         │
┌────────▼────────┐
│  Backend Server │
│   (Node.js)     │
│  - TCP/IP Check │
│  - SSID Check   │
│  - Location API │
└────────┬────────┘
         │
         │ Firebase (Auth + Data)
         │
┌────────▼────────┐
│   Firebase      │
│   Database      │
└─────────────────┘
```

## Setup Instructions

### 1. Backend Server Setup

```bash
cd server
npm install
npm start
```

The server will start on port 3001 (configurable via `.env`).

### 2. Configure Network Settings

Edit `server/.env`:

```env
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-in-production
ALLOWED_NETWORKS=192.168.1.0/24,10.0.0.0/8,172.16.0.0/12
ALLOWED_SSIDS=Hospital-WiFi,HealthGuard-Network
FACILITY_LAT=40.7128
FACILITY_LNG=-74.0060
FACILITY_RADIUS=0.01
```

**Configuration Options:**

- `ALLOWED_NETWORKS`: Comma-separated CIDR ranges for allowed IP networks
  - `192.168.1.0/24` - Typical home/office network
  - `10.0.0.0/8` - Private network range
  - `172.16.0.0/12` - Private network range

- `ALLOWED_SSIDS`: Comma-separated Wi-Fi network names
  - Doctors must be connected to one of these networks

- `FACILITY_LAT/LNG`: GPS coordinates of healthcare facility
  - Get from Google Maps: Right-click location → "What's here?"

- `FACILITY_RADIUS`: Access radius in degrees
  - `0.01` ≈ 1 km
  - `0.001` ≈ 100 meters

### 3. Frontend Setup

The frontend is already configured to use the backend API at `http://localhost:3001`.

To change the API URL, edit `src/api.js`:

```javascript
const API_BASE_URL = 'http://your-server-url:3001';
```

### 4. Start the Application

```bash
# Terminal 1: Start backend server
cd server
npm start

# Terminal 2: Start frontend
cd ..
npm run dev
```

## Usage

### Doctor Access

1. Select "Doctor" role on login page
2. Enter email, password, and Wi-Fi SSID
3. Must be connected to hospital Wi-Fi network
4. Access granted if IP is in allowed range AND SSID matches

**Example:**
```
Email: doctor@hospital.com
Password: ********
Wi-Fi SSID: Hospital-WiFi
```

### Patient Access

1. Select "Patient" role on login page
2. Enter email and password
3. Browser will request location permission
4. Access granted if GPS location is within facility radius

**Example:**
```
Email: patient@email.com
Password: ********
Location: Auto-detected via GPS
```

## Testing

### Test Network Validation

```bash
curl -X POST http://localhost:3001/api/validate-network \
  -H "Content-Type: application/json" \
  -d '{"ssid":"Hospital-WiFi","location":{"lat":40.7128,"lng":-74.0060}}'
```

### Test Doctor Registration

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"doctor@hospital.com",
    "password":"password123",
    "role":"doctor",
    "name":"Dr. Smith",
    "ssid":"Hospital-WiFi"
  }'
```

### Test Patient Registration

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"patient@email.com",
    "password":"password123",
    "role":"patient",
    "name":"John Doe",
    "location":{"lat":40.7128,"lng":-74.0060}
  }'
```

## Security Considerations

### Important Notes

⚠️ **For Production Use:**

1. **Use HTTPS**: Always use HTTPS in production
2. **Strong JWT Secret**: Generate a cryptographically secure secret
3. **Password Hashing**: Replace plaintext passwords with bcrypt
4. **Database**: Use PostgreSQL/MongoDB instead of in-memory storage
5. **Rate Limiting**: Implement rate limiting on auth endpoints
6. **Session Management**: Implement proper session expiration
7. **Audit Logging**: Log all access attempts for security monitoring
8. **IP Whitelisting**: Consider implementing strict IP whitelisting

### Network Security Best Practices

1. **Use VPN**: Require VPN access for remote doctors
2. **Certificate-based Auth**: Add client certificates for extra security
3. **Time-based Access**: Restrict access to business hours
4. **Geo-fencing**: Implement additional geographic restrictions
5. **Device Registration**: Register and whitelist specific devices

### Limitations

1. **Browser SSID Detection**: Most browsers don't allow direct SSID detection
   - Solution: Manual entry or mobile app
   - Alternative: Use captive portal detection

2. **GPS Spoofing**: GPS can be spoofed on some devices
   - Solution: Combine with network validation
   - Add device fingerprinting

3. **IP Spoofing**: IPs can be spoofed in some scenarios
   - Solution: Use VPN with certificate auth
   - Implement additional verification layers

## Troubleshooting

### Doctor Login Fails

**Error: "Network access denied"**
- Check if IP is in `ALLOWED_NETWORKS`
- Verify Wi-Fi SSID matches `ALLOWED_SSIDS`
- Check server logs for IP validation

**Error: "Wi-Fi network invalid"**
- Verify SSID spelling (case-sensitive)
- Check if connected to correct network
- Try entering SSID manually

### Patient Login Fails

**Error: "Location access denied"**
- Enable location services in browser
- Check if GPS coordinates are within facility radius
- Verify `FACILITY_LAT` and `FACILITY_LNG` are correct

**Error: "Location required"**
- Grant location permission when prompted
- Check browser location settings
- Try a different browser

### Server Won't Start

**Error: "Port already in use"**
- Change PORT in `.env` file
- Kill process using port 3001: `lsof -ti:3001 | xargs kill`

**Error: "Module not found"**
- Run `npm install` in server directory
- Check Node.js version (requires Node 16+)

## Advanced Configuration

### Multiple Facilities

To support multiple facilities:

1. Add facility coordinates to database
2. Update location validation to check all facilities
3. Add facility selection to login form

### Custom TCP Ports

To use custom TCP ports:

```env
PORT=8080
```

Update frontend API URL accordingly:
```javascript
const API_BASE_URL = 'http://localhost:8080';
```

### Proxy Configuration

For production behind reverse proxy (nginx):

```nginx
location /api/ {
    proxy_pass http://localhost:3001;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Monitoring

### Access Logs

Monitor access attempts by checking server logs:

```bash
# View real-time logs
npm start 2>&1 | tee access.log

# Filter for failed attempts
grep "403" access.log
```

### Metrics to Track

- Successful vs failed login attempts
- Network validation failures
- Location validation failures
- Access by time of day
- Access by IP range

## Support

For issues or questions:
1. Check server logs for error messages
2. Verify network configuration
3. Test API endpoints with curl
4. Review browser console for frontend errors
