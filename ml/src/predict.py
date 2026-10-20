"""
Model Serving API with Flask
REST API for serving trained ML model predictions
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np
import json
import os
from pathlib import Path
from preprocessing import DataPreprocessor


app = Flask(__name__)
CORS(app)

# Resolve artifacts from this file so the service works from any working directory.
ML_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = Path(os.environ.get('MODEL_PATH', ML_ROOT / 'models/saved/healthcare_model.h5'))
TRAINING_INFO_PATH = Path(os.environ.get('TRAINING_INFO_PATH', ML_ROOT / 'training_info/training_info.json'))
SCALER_PATH = Path(os.environ.get('SCALER_PATH', ML_ROOT / 'training_info/scaler.json'))
PORT = int(os.environ.get('PORT', '5000'))

# Global variables
model = None
label_mappings = None
feature_names = None
scaler = None


def load_model_and_artifacts():
    """Load model and required artifacts"""
    global model, label_mappings, feature_names, scaler
    
    print("Loading model and artifacts...")
    
    # Load model
    if not MODEL_PATH.exists():
        print(f"Error: Model not found at {MODEL_PATH}")
        print("Please train the model first using: python src/train.py")
        return False
    
    model = tf.keras.models.load_model(MODEL_PATH)
    print("Model loaded successfully")
    
    # Load training info
    with TRAINING_INFO_PATH.open('r') as f:
        training_info = json.load(f)
        label_mappings = {int(k): v for k, v in training_info['label_mappings'].items()}
        feature_names = training_info['feature_names']
    
    print(f"Label mappings: {label_mappings}")
    print(f"Features: {len(feature_names)}")
    
    # Load the exact scaler fitted during preprocessing.
    if not SCALER_PATH.exists():
        raise FileNotFoundError(f"Scaler artifact not found at {SCALER_PATH}; rerun preprocessing")
    with SCALER_PATH.open('r') as f:
        scaler_info = json.load(f)
    scaler = DataPreprocessor().scaler
    scaler.mean_ = np.array(scaler_info['mean'], dtype=float)
    scaler.scale_ = np.array(scaler_info['scale'], dtype=float)
    scaler.var_ = np.array(scaler_info['var'], dtype=float)
    scaler.n_features_in_ = len(scaler.mean_)
    scaler.n_samples_seen_ = scaler_info['n_samples_seen']
    
    print("Artifacts loaded successfully")
    return True


def preprocess_input(data):
    """
    Preprocess input data for prediction
    """
    # Create feature dictionary with defaults
    features = {
        'age': data.get('age', 35),
        'gender': 1 if data.get('gender', 'male') == 'female' else 0,
        'bmi': data.get('bmi', 25.0),
        'temperature': data.get('temperature', 37.0),
        'systolic_bp': data.get('systolic_bp', 120),
        'diastolic_bp': data.get('diastolic_bp', 80),
        'heart_rate': data.get('heart_rate', 75),
        'wbc_count': data.get('wbc_count', 8000),
        'hemoglobin': data.get('hemoglobin', 14.0)
    }
    
    # Process symptoms
    input_symptoms = data.get('symptoms', [])
    symptom_list = ['fever', 'headache', 'fatigue', 'body_ache', 'sore_throat', 
                  'chills', 'dizziness', 'blurred_vision', 'increased_thirst',
                  'frequent_urination', 'localized_pain', 'high_fever', 'severe_fatigue', 'none']
    
    for symptom in symptom_list:
        features[f'symptom_{symptom}'] = 1 if symptom in input_symptoms else 0
    
    # Convert to array in correct order
    feature_array = np.array([features[fname] for fname in feature_names])
    
    # Scale features
    feature_array_scaled = scaler.transform(feature_array.reshape(1, -1))
    
    return feature_array_scaled


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'service': 'Healthcare ML Prediction API'
    })


@app.route('/predict', methods=['POST'])
def predict():
    """
    Make prediction from patient data
    
    Expected JSON input:
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
    """
    if model is None:
        return jsonify({
            'error': 'Model not loaded',
            'message': 'Please train the model first'
        }), 503
    
    try:
        data = request.json
        
        # Preprocess input
        features_scaled = preprocess_input(data)
        
        # Make prediction
        prediction = model.predict(features_scaled, verbose=0)
        
        # Get predicted class and confidence
        predicted_class_idx = np.argmax(prediction[0])
        predicted_class = label_mappings[predicted_class_idx]
        confidence = float(prediction[0][predicted_class_idx])
        
        # Get top 3 predictions
        top_3_indices = np.argsort(prediction[0])[-3:][::-1]
        top_3_predictions = [
            {
                'condition': label_mappings[idx],
                'confidence': float(prediction[0][idx])
            }
            for idx in top_3_indices
        ]
        
        # Build response
        response = {
            'prediction': {
                'condition': predicted_class,
                'confidence': confidence,
                'top_alternatives': top_3_predictions[1:]  # Exclude the top prediction
            },
            'input_features': {
                'age': data.get('age'),
                'symptoms': data.get('symptoms', []),
                'temperature': data.get('temperature'),
                'blood_pressure': f"{data.get('systolic_bp')}/{data.get('diastolic_bp')}"
            },
            'model_info': {
                'version': '1.0',
                'type': 'custom_neural_network',
                'training_accuracy': 'See training_info.json'
            },
            'disclaimer': 'This is an AI prediction for informational purposes only. '
                        'Always consult a healthcare professional for medical diagnosis.'
        }
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({
            'error': str(e),
            'message': 'Prediction failed'
        }), 500


@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    """
    Make predictions for multiple samples
    """
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 503
    
    try:
        data = request.json
        samples = data.get('samples', [])
        
        predictions = []
        for sample in samples:
            features_scaled = preprocess_input(sample)
            prediction = model.predict(features_scaled, verbose=0)
            
            predicted_class_idx = np.argmax(prediction[0])
            predicted_class = label_mappings[predicted_class_idx]
            confidence = float(prediction[0][predicted_class_idx])
            
            predictions.append({
                'condition': predicted_class,
                'confidence': confidence
            })
        
        return jsonify({
            'predictions': predictions,
            'count': len(predictions)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/model/info', methods=['GET'])
def model_info():
    """Get model information"""
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 503
    
    try:
        with TRAINING_INFO_PATH.open('r') as f:
            training_info = json.load(f)
        
        return jsonify({
            'model_loaded': True,
            'architecture': training_info.get('architecture'),
            'final_accuracy': training_info.get('final_accuracy'),
            'best_val_accuracy': training_info.get('best_val_accuracy'),
            'num_classes': len(label_mappings),
            'classes': label_mappings,
            'features': feature_names
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Load model on startup
    if load_model_and_artifacts():
        print("Starting ML Prediction API server...")
        print(f"Server will be available at http://localhost:{PORT}")
        app.run(host=os.environ.get('HOST', '127.0.0.1'), port=PORT, debug=False)
    else:
        print("Failed to load model. Exiting.")
        exit(1)
