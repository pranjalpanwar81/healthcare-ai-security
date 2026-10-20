# Healthcare ML Training Pipeline

Custom machine learning model for healthcare diagnosis prediction using TensorFlow/Keras.

## 📁 Directory Structure

```
ml/
├── data/
│   ├── raw/                    # Raw datasets
│   ├── processed/              # Cleaned data
│   └── train_test_split/       # Split data for training
├── models/
│   ├── saved/                  # Trained models
│   └── checkpoints/           # Training checkpoints
├── src/
│   ├── preprocessing.py        # Data preprocessing
│   ├── model.py               # Neural network architecture
│   ├── train.py               # Training script
│   ├── evaluate.py            # Evaluation script
│   └── predict.py             # Model serving API
├── notebooks/                  # Jupyter notebooks
├── training_info/              # Training logs and metrics
├── logs/                       # TensorBoard logs
└── requirements.txt            # Python dependencies
```

## 🚀 Quick Start

### 1. Set Up Python Environment

```bash
cd ml
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Generate and Preprocess Data

```bash
cd src
python preprocessing.py
```

This will:
- Generate 10,000 synthetic healthcare samples
- Clean and preprocess the data
- Split into train/val/test (70/15/15)
- Save preprocessed data

### 3. Train the Model

```bash
python train.py
```

This will:
- Build a deep neural network
- Train for 100 epochs (extensive training for best accuracy)
- Use early stopping to prevent overfitting
- Save the best model
- Generate training plots

### 4. Evaluate the Model

```bash
python evaluate.py
```

This will:
- Load the trained model
- Evaluate on test set
- Generate classification report
- Plot confusion matrix
- Calculate comprehensive metrics

### 5. Start Prediction API

```bash
python predict.py
```

Run the command from `ml/src` (or provide the script path). The service resolves
model and training artifacts relative to the project, independent of the current
working directory. It starts at `http://127.0.0.1:5000` by default.

Configure the listener when that port is already occupied:

```bash
PORT=5001 python predict.py
```

`MODEL_PATH` and `TRAINING_INFO_PATH` can override the default artifact paths.
The service only binds to localhost by default; set `HOST=0.0.0.0` when access
from another device is required.

Check that it is ready with `curl http://127.0.0.1:5000/health`. A healthy
response reports `model_loaded: true`. If the port is occupied, identify the
existing process with `lsof -nP -iTCP:5000 -sTCP:LISTEN`; stop it only if it is
the old prediction server you intend to replace, or use another `PORT`.

## 📊 Model Architecture

### Deep Neural Network (Default)
- Input layer: 17 features
- Hidden layers: 256 → 128 → 64 → 32 neurons
- Dropout: 0.4 → 0.3 → 0.3 → 0.2
- Batch normalization after each dense layer
- L2 regularization (0.01)
- Output: 5 classes (softmax activation)

### Training Configuration
- **Epochs**: 100 (extensive for best accuracy)
- **Batch Size**: 32
- **Learning Rate**: 0.001 (with reduction on plateau)
- **Optimizer**: Adam
- **Loss**: Sparse Categorical Crossentropy
- **Metrics**: Accuracy, Precision, Recall

## 🎯 Medical Conditions (Classes)

1. **healthy** - No significant health issues
2. **viral_infection** - Viral infections (flu, cold, etc.)
3. **bacterial_infection** - Bacterial infections
4. **hypertension** - High blood pressure
5. **diabetes_complication** - Diabetes-related issues

## 📈 Features

The model uses 17 features:
- **Demographics**: age, gender, BMI
- **Vitals**: temperature, systolic_bp, diastolic_bp, heart_rate
- **Lab Results**: wbc_count, hemoglobin
- **Symptoms**: 14 binary symptom indicators

## 🔌 API Endpoints

### POST /predict
Make a single prediction.

**Request:**
```json
{
  "age": 35,
  "gender": "male",
  "bmi": 25.0,
  "temperature": 37.5,
  "systolic_bp": 120,
  "diastolic_bp": 80,
  "heart_rate": 75,
  "wbc_count": 8000,
  "hemoglobin": 14.0,
  "symptoms": ["fever", "headache"]
}
```

**Response:**
```json
{
  "prediction": {
    "condition": "viral_infection",
    "confidence": 0.85,
    "top_alternatives": [...]
  },
  "disclaimer": "..."
}
```

### GET /health
Health check endpoint.

### GET /model/info
Get model information and training metrics.

### POST /predict/batch
Batch predictions for multiple samples.

## 📊 Training Metrics

The model is evaluated on:
- **Accuracy**: Overall correctness
- **Precision**: False positive rate
- **Recall**: False negative rate
- **F1-Score**: Balance of precision and recall
- **Confusion Matrix**: Detailed error analysis
- **ROC-AUC**: Multi-class ROC score

## 🔍 Monitoring

### TensorBoard
```bash
tensorboard --logdir=../logs
```

### Training Plots
- Training history saved to `training_info/training_history.png`
- Confusion matrix saved to `training_info/confusion_matrix.png`

## ⚙️ Hyperparameter Tuning

To tune hyperparameters, modify `train.py`:

```python
# Uncomment in train.py main()
trainer.train_with_hyperparameter_tuning(
    X_train, y_train, X_val, y_val,
    num_classes, feature_names, label_mappings
)
```

This tests:
- Learning rates: [0.001, 0.0005, 0.0001]
- Batch sizes: [16, 32, 64]
- Architectures: ['deep', 'residual']

## 🔒 Security & Privacy

- **No Real Patient Data**: Uses synthetic data for training
- **HIPAA Compliance**: Ready for anonymized real data
- **API Security**: Requires proper authentication in production
- **Data Privacy**: All processing server-side

## 📝 Integration with Express Backend

The ML API runs on port 5000. To integrate with the Express backend:

```javascript
// server/server.js
const axios = require('axios');

app.post('/api/ai/analyze-symptoms', async (req, res) => {
  try {
    const response = await axios.post('http://localhost:5000/predict', {
      age: req.body.age,
      gender: req.body.gender,
      symptoms: req.body.symptoms,
      temperature: req.body.temperature,
      // ... other features
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'ML service error' });
  }
});
```

## 🚀 Production Deployment

### Docker (Recommended)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY src/ ./src/
COPY models/ ./models/
COPY training_info/ ./training_info/
CMD ["python", "src/predict.py"]
```

### Environment Variables
```bash
export MODEL_PATH=models/saved/healthcare_model.h5
export PORT=5000
```

## 📚 References

- TensorFlow Documentation: https://www.tensorflow.org/
- Keras Documentation: https://keras.io/
- Scikit-learn: https://scikit-learn.org/

## ⚠️ Disclaimer

This model is for educational and demonstration purposes only. It should not be used for actual medical diagnosis. Always consult qualified healthcare professionals for medical decisions.
