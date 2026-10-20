# HealthGuard AI - Healthcare Security & AI Platform

A comprehensive healthcare application with custom machine learning, AI-powered features, and robust security measures for medical record management.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.16-FF6F00.svg)

## 🎯 Project Overview

HealthGuard AI is a full-stack healthcare application that combines:
- **Custom ML Model**: Trained neural network for medical condition prediction
- **AI-Powered Features**: LangChain integration for symptom analysis, drug interaction checking, and medical record summarization
- **Role-Based Access**: Separate dashboards for doctors and patients
- **Secure Authentication**: JWT-based authentication with network validation
- **Real-Time Sync**: Firebase Firestore integration for production deployments

## ✨ Key Features

### 🤖 Custom Machine Learning Model
- **98.2% Accuracy** on medical condition prediction
- **99.99% ROC-AUC Score**
- **97.22% Macro F1-Score**
- 5-class classification system:
  - Bacterial Infection
  - Diabetes Complication
  - Healthy
  - Hypertension
  - Viral Infection

### 🧠 AI-Powered Tools (LangChain Integration)
1. **Symptom Analyzer** - AI triage system with urgency levels (LOW/MEDIUM/HIGH/EMERGENCY)
2. **Drug Interaction Checker** - Medication safety analysis with severity ratings
3. **Medical Chatbot** - Conversational AI with memory for health Q&A
4. **Record Summarizer** - AI-powered medical record summaries
5. **Treatment Recommendations** - Clinical decision support (doctors only)
6. **Anomaly Detection** - Pattern analysis in medical records

### 👥 User Roles
- **Doctor Dashboard**:
  - Patient management
  - Medical record access
  - Treatment suggestions
  - AI-powered analysis tools
  - Network validation for security

- **Patient Dashboard**:
  - Personal health records
  - Symptom analysis
  - Drug interaction checking
  - Medical chatbot
  - Consent-based AI features

### 🔒 Security Features
- JWT-based authentication
- Role-based access control
- Network SSID validation (production mode)
- Consent-based AI feature usage
- Server-side API key management
- HIPAA-aware design patterns

## 📊 Model Performance

### Custom ML Model Results

```
Classification Report:
------------------------------------------------------------
                       precision    recall  f1-score   support

  bacterial_infection       1.00      1.00      1.00       303
diabetes_complication       1.00      0.84      0.91       148
              healthy       1.00      1.00      1.00       440
         hypertension       0.95      0.99      0.97       227
      viral_infection       0.96      1.00      0.98       382

             accuracy                           0.98      1500
            macro avg       0.98      0.96      0.97      1500
         weighted avg       0.98      0.98      0.98      1500

Overall Metrics:
  Accuracy: 0.9820
  Macro Precision: 0.9826
  Macro Recall: 0.9649
  Macro F1-Score: 0.9722
  ROC-AUC Score: 0.9999
```

### Training Configuration
- **Dataset**: 10,000 synthetic healthcare records
- **Split**: 70% training / 15% validation / 15% testing
- **Features**: 23 medical features (age, gender, BMI, vitals, lab results, symptoms)
- **Architecture**: Deep neural network with batch normalization and dropout
- **Training**: 50 epochs with early stopping
- **Model Format**: TensorFlow/Keras H5

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React 19
- Vite (build tool)
- React Router DOM
- Lucide React (icons)
- Firebase Client SDK

**Backend:**
- Node.js (ES Modules)
- Express.js
- JWT (jsonwebtoken)
- Firebase Admin SDK
- LangChain.js
- dotenv

**Machine Learning:**
- Python 3.9
- TensorFlow 2.16.1
- Keras
- scikit-learn
- pandas
- NumPy
- Flask (model serving API)

**Database:**
- Firebase Firestore (production)
- Local JSON (demo mode)

### System Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   React App     │         │  Express Server │         │  Custom ML API  │
│   (Frontend)    │◄────────►│   (Backend)     │◄────────►│   (Flask/TF)    │
│                 │         │                 │         │                 │
│ - Dashboard     │         │ - Auth (JWT)    │         │ - Model Load    │
│ - AI Tools      │         │ - LangChain     │         │ - Predictions   │
│ - Chatbot       │         │ - API Routes    │         │ - Feature Eng   │
└─────────────────┘         └─────────────────┘         └─────────────────┘
         │                           │                           │
         └───────────────────────────┴───────────────────────────┘
                                           │
                                   ┌───────▼───────┐
                                   │ Firebase /    │
                                   │ Local JSON    │
                                   │ (Data Store)  │
                                   └───────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9 (for ML features)
- npm or yarn
- Google account (for Gemini API or Firebase)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/pranjalpanwar81/healthcare-ai-security.git
   cd healthcare-ai-security
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd server
   npm install
   ```

4. **Set up Python ML environment** (optional, for custom ML)
   ```bash
   cd ml
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

5. **Configure environment variables**
   ```bash
   cd server
   cp .env.example .env
   ```

   Edit `.env` with your configuration:
   ```env
   # AI Provider Configuration
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your-gemini-api-key
   GEMINI_MODEL=gemini-1.5-flash
   
   # OR use OpenAI
   # AI_PROVIDER=openai
   # OPENAI_API_KEY=your-openai-api-key
   # OPENAI_MODEL=gpt-4o-mini
   
   # Firebase Configuration (optional, for production)
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-service-account-email
   FIREBASE_PRIVATE_KEY=your-private-key
   ```

### Running the Application

1. **Start the backend server**
   ```bash
   cd server
   npm start
   ```
   Server runs on `http://localhost:3001`

2. **Start the frontend (new terminal)**
   ```bash
   npm run dev
   ```
   Frontend runs on `http://localhost:5173`

3. **Start the ML prediction API** (optional, for custom ML)
   ```bash
   cd ml
   source venv/bin/activate
   python src/predict.py
   ```
   ML API runs on `http://localhost:5000`

### Demo Credentials

**Patient Login:**
- Email: `john.doe@email.com`
- Password: `DemoPatient123!`

**Doctor Login:**
- Email: `dr.smith@hospital.com`
- Password: `DemoDoctor123!`

Or use the "Demo Sign In" button on the login page.

## 📁 Project Structure

```
healthcare-ai-security/
├── src/                          # React frontend
│   ├── components/              # React components
│   │   ├── AIDashboard.jsx
│   │   ├── SymptomAnalyzer.jsx
│   │   ├── DrugInteractionChecker.jsx
│   │   ├── MedicalChatbot.jsx
│   │   ├── RecordSummarizer.jsx
│   │   ├── PatientDashboard.jsx
│   │   └── DoctorDashboard.jsx
│   ├── App.jsx                  # Main app component
│   ├── api.js                   # API client
│   └── main.jsx                 # Entry point
├── server/                      # Express backend
│   ├── server.js               # Main server file
│   ├── langchainService.js     # LangChain AI integration
│   ├── seed-demo.js            # Demo data seeding
│   └── .env.example            # Environment template
├── ml/                          # Custom ML pipeline
│   ├── src/
│   │   ├── preprocessing.py    # Data preprocessing
│   │   ├── model.py            # Model architecture
│   │   ├── train.py            # Training script
│   │   ├── evaluate.py         # Evaluation script
│   │   └── predict.py          # Prediction API
│   ├── models/                 # Trained models
│   ├── data/                   # Training data
│   └── requirements.txt        # Python dependencies
├── public/                      # Static assets
└── package.json                # Frontend dependencies
```

## 🧪 Machine Learning Pipeline

### Training the Model

```bash
cd ml
source venv/bin/activate

# 1. Generate synthetic data and preprocess
python src/preprocessing.py

# 2. Train the model
python src/train.py

# 3. Evaluate the model
python src/evaluate.py

# 4. Start prediction API
python src/predict.py
```

### Model Architecture

- **Input Layer**: 23 features (age, gender, BMI, vitals, lab results, symptoms)
- **Hidden Layers**:
  - Dense (128 neurons) + Batch Normalization + Dropout (0.3)
  - Dense (64 neurons) + Dropout (0.3)
  - Dense (32 neurons)
- **Output Layer**: 5 neurons (softmax activation for multi-class classification)
- **Optimizer**: Adam
- **Loss**: Sparse Categorical Crossentropy
- **Metrics**: Accuracy, Precision, Recall

### Features Used

1. **Demographics**: Age, Gender
2. **Physical**: BMI, Temperature
3. **Vitals**: Systolic BP, Diastolic BP, Heart Rate
4. **Lab Results**: WBC, Hemoglobin, Blood Glucose, Cholesterol
5. **Symptoms**: Fever, Cough, Headache, Fatigue, etc.

## 🔧 Configuration

### AI Provider Setup

**Option 1: Gemini (Google AI)**
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key
3. Add to `server/.env`:
   ```env
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your-api-key
   GEMINI_MODEL=gemini-1.5-flash
   ```

**Option 2: OpenAI**
1. Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add to `server/.env`:
   ```env
   AI_PROVIDER=openai
   OPENAI_API_KEY=your-api-key
   OPENAI_MODEL=gpt-4o-mini
   ```

### Firebase Setup (Optional)

For production deployments with real-time sync:

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Firestore Database
3. Create a service account key
4. Add credentials to `server/.env`:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-service-account-email
   FIREBASE_PRIVATE_KEY=your-private-key
   ```

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for detailed instructions.

## 📱 Screenshots & Usage

### Patient Dashboard
- View personal health records
- Access AI-powered symptom analysis
- Check drug interactions
- Chat with medical AI assistant
- Request record summaries

### Doctor Dashboard
- Manage patient records
- View patient histories
- Access treatment recommendations
- Analyze symptoms with AI
- Summarize patient records

### AI Tools
- **Symptom Analyzer**: Enter symptoms, get triage and potential conditions
- **Drug Interaction Checker**: Check medication safety profiles
- **Medical Chatbot**: Ask health questions in natural language
- **Record Summarizer**: Get AI-generated summaries of medical records

## ⚠️ Important Disclaimers

- **AI Output**: All AI-generated content is for educational purposes only and should not be used as a substitute for professional medical advice, diagnosis, or treatment.
- **Demo Data**: The default mode uses fictional demo data. Do not use for real patient care.
- **Privacy**: Free-tier AI providers may use submitted content to improve their services. Use only with fictional data or approved providers for real patient information.
- **Security**: Local demo storage is unencrypted. Use Firebase/Firestore for production deployments with proper security measures.
- **Medical Accuracy**: The custom ML model is trained on synthetic data and should not be used for actual medical diagnosis.

## 🔒 Security Considerations

### Implemented Security Measures
- JWT-based authentication with expiration
- Role-based access control (doctor/patient)
- Network SSID validation in production mode
- Server-side API key storage
- Consent-based AI feature usage
- Input validation and sanitization
- CORS configuration

### HIPAA Compliance Notes
- This demo is not HIPAA-compliant out of the box
- For production use, implement:
  - End-to-end encryption
  - Audit logging
  - Access controls
  - Business Associate Agreements (BAAs) with cloud providers
  - PHI anonymization before AI processing

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- LangChain.js for AI framework
- TensorFlow/Keras for ML infrastructure
- Firebase for real-time database
- Google Gemini AI for language model
- React and Vite for frontend framework

## 📞 Support

For questions or issues:
- Open an issue on GitHub
- Check the documentation in the `/docs` folder
- Review [QUICK_START.md](QUICK_START.md) for quick setup

## 🗺️ Roadmap

- [ ] Integrate ML prediction API with Express backend
- [ ] Add SHAP explainability for ML predictions
- [ ] Implement fairness bias detection
- [ ] Add more medical condition classes
- [ ] Implement EHR data import
- [ ] Add multi-language support
- [ ] Mobile app development

---

**Built with ❤️ for healthcare innovation**

**Note**: This is a demonstration project. For actual medical applications, ensure proper regulatory compliance, professional review, and patient safety measures.
