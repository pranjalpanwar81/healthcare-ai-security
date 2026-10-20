// API client for HealthGuard AI backend
// Use the host that served this page so phones/laptops on the same Wi-Fi
// reach the shared backend instead of their own localhost.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `Request failed (${response.status})`);
  return data;
}

export const api = {
  // Network validation
  validateNetwork: async (ssid, location) => {
    const response = await fetch(`${API_BASE_URL}/api/validate-network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid, location })
    });
    return response.json();
  },

  // Authentication
  register: async (userData) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    return response.json();
  },

  login: async (email, password, role, ssid, location) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role, ssid, location })
    });
    return response.json();
  },

  createDemoSession: async (email, name, role) => request(`${API_BASE_URL}/api/auth/demo-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, role })
  }),

  logout: async (token) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    return response.json();
  },

  // User
  getCurrentUser: async (token) => {
    const response = await fetch(`${API_BASE_URL}/api/user/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.json();
  },

  // Patients (doctor only)
  getPatients: async (token) => {
    return request(`${API_BASE_URL}/api/patients`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },

  deletePatient: async (token, patientId) => request(`${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  }),

  addPatient: async (token, patient) => request(`${API_BASE_URL}/api/patients`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(patient)
  }),

  getDoctorOverview: async (token) => request(`${API_BASE_URL}/api/doctor/overview`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }),

  getPatientRecords: async (token, patientId) => {
    return request(`${API_BASE_URL}/api/patients/${patientId}/records`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },

  // Add patient record (doctor only) - Real-time sync
  addPatientRecord: async (token, patientId, recordData) => {
    return request(`${API_BASE_URL}/api/patients/${patientId}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(recordData)
    });
  },

  // Patient records (patient only)
  getMyRecords: async (token) => {
    return request(`${API_BASE_URL}/api/my-records`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },

  // LangChain AI Features
  summarizeRecords: async (token, body) => request(`${API_BASE_URL}/api/ai/summarize-records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  }),

  analyzeSymptoms: async (token, body) => request(`${API_BASE_URL}/api/ai/analyze-symptoms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  }),

  checkDrugInteractions: async (token, body) => request(`${API_BASE_URL}/api/ai/check-drug-interactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  }),

  suggestTreatments: async (token, body) => request(`${API_BASE_URL}/api/ai/suggest-treatments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  }),

  aiChat: async (token, body) => request(`${API_BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  }),

  detectAnomalies: async (token, body) => request(`${API_BASE_URL}/api/ai/detect-anomalies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  })
};

// Helper to get user location
export const getUserLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
};

// Helper to detect Wi-Fi SSID (limited browser support)
export const getWifiSSID = () => {
  // Note: Direct SSID detection is not possible in most browsers
  // This is a placeholder - in production, use:
  // 1. Manual user input
  // 2. Mobile native app
  // 3. Network Information API (Chrome only, limited)
  // 4. Captive portal detection

  if (navigator.connection && navigator.connection.type) {
    return navigator.connection.type;
  }

  return null;
};
