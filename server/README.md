# HealthGuard AI Backend Server

Custom Node.js backend server with network-based access control for healthcare applications.

## Features

- **TCP/IP Network Validation**: Restricts access based on IP ranges
- **Wi-Fi SSID Validation**: Verifies connection to hospital networks
- **Remote Patient Access**: Patients can view their own records from any location
- **Role-based Access Control**: Separate views for doctors and patients
- **JWT Authentication**: Secure token-based authentication
- **Network Middleware**: Automatic network validation on protected routes

## Installation

```bash
cd server
npm install
```

## Configuration

Edit `.env` file to configure:

- `PORT`: Server port (default: 3001)
- `JWT_SECRET`: Secret key for JWT tokens
- `ALLOWED_NETWORKS`: Comma-separated CIDR ranges for allowed networks
- `ALLOWED_SSIDS`: Comma-separated Wi-Fi SSIDs for hospital networks

## Running the Server

```bash
# Development
npm run dev

# Production
npm start
```

### Local symptom model

The Symptom Analyzer sends requests through `/api/ai/analyze-symptoms` to the
local TensorFlow service. Start it from the project root in a separate terminal:

```bash
PORT=5001 ./ml/venv/bin/python ml/src/predict.py
```

The backend uses `LOCAL_ML_API_URL` (default `http://127.0.0.1:5001`). This
symptom prediction flow does not require a Gemini key. Other generative AI
features still use the configured AI provider.

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Network Validation
- `POST /api/validate-network` - Validate network connection
  - Body: `{ ssid, location }`

### Authentication
- `POST /api/auth/register` - Register new user
  - Body: `{ email, password, role, name, ssid, location }`
- `POST /api/auth/login` - Login user
  - Body: `{ email, password, ssid, location }`
- `POST /api/auth/logout` - Logout user
  - Headers: `Authorization: Bearer <token>`

### Protected Routes (require authentication and network validation)
- `GET /api/user/me` - Get current user info
- `GET /api/patients` - Get all patients (doctor only)
- `GET /api/patients/:id/records` - Get patient records (doctor only)
- `GET /api/my-records` - Get own records (patient only)

## Network Access Rules

### Doctors
- Must access from allowed IP ranges
- Must connect to allowed Wi-Fi SSIDs
- Full access to patient records

### Patients
- Must provide GPS location
- Must be within facility radius
- Can only access own records

## Security Notes

⚠️ **Important for Production:**

1. Replace plaintext password storage with bcrypt hashing
2. Use a strong, randomly generated JWT_SECRET
3. Implement rate limiting on authentication endpoints
4. Add HTTPS/TLS encryption
5. Use a proper database (PostgreSQL, MongoDB) instead of in-memory storage
6. Implement proper session management
7. Add audit logging for all access attempts
8. Consider implementing certificate-based authentication for extra security

## Testing Network Access

### Testing from allowed network:
```bash
curl -X POST http://localhost:3001/api/validate-network \
  -H "Content-Type: application/json" \
  -d '{"ssid":"Hospital-WiFi","location":{"lat":40.7128,"lng":-74.0060}}'
```

### Testing authentication:
```bash
# Register doctor
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@hospital.com","password":"pass123","role":"doctor","name":"Dr. Smith","ssid":"Hospital-WiFi"}'

# Login doctor
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@hospital.com","password":"pass123","ssid":"Hospital-WiFi"}'
```

## Wi-Fi SSID Detection

Browser security prevents direct SSID detection. Options:

1. **Manual Entry**: User enters SSID manually
2. **Network Information API**: Limited browser support (Chrome only)
3. **Mobile App**: Native app can detect SSID
4. **Captive Portal**: Custom network portal that captures SSID

## Location Detection

Use browser Geolocation API:

```javascript
navigator.geolocation.getCurrentPosition(
  (position) => {
    const location = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    // Send to server
  },
  (error) => {
    console.error('Location error:', error);
  }
);
```
