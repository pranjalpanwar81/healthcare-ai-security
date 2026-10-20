"""
Model Evaluation Script
Comprehensive evaluation metrics and analysis for healthcare ML model
"""

import tensorflow as tf
from tensorflow import keras
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    classification_report, confusion_matrix, roc_auc_score,
    precision_recall_curve, average_precision_score
)
import json
import os
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]


class ModelEvaluator:
    """Comprehensive model evaluation"""
    
    def __init__(self, model_path=None):
        self.model_path = Path(model_path) if model_path else ML_ROOT / 'models/saved/healthcare_model.h5'
        self.model = None
        self.label_mappings = None
        
    def load_model(self):
        """Load trained model"""
        print(f"Loading model from {self.model_path}...")
        self.model = keras.models.load_model(self.model_path)
        print("Model loaded successfully")
        
        # Load label mappings
        with (ML_ROOT / 'training_info/training_info.json').open('r') as f:
            training_info = json.load(f)
            # Convert string keys to int keys
            self.label_mappings = {int(k): v for k, v in training_info['label_mappings'].items()}
        
        return self.model
    
    def load_test_data(self):
        """Load test data"""
        from preprocessing import DataPreprocessor
        preprocessor = DataPreprocessor()
        
        X_train, X_val, X_test, y_train, y_val, y_test, feature_names, label_mappings = \
            preprocessor.load_preprocessed_data()
        
        self.label_mappings = label_mappings
        
        return X_test, y_test, feature_names
    
    def evaluate(self, X_test, y_test):
        """
        Comprehensive model evaluation
        """
        print("\n" + "=" * 60)
        print("MODEL EVALUATION")
        print("=" * 60)
        
        # Load model if not loaded
        if self.model is None:
            self.load_model()
        
        # Make predictions
        print("\nMaking predictions...")
        y_pred_proba = self.model.predict(X_test, verbose=0)
        y_pred = np.argmax(y_pred_proba, axis=1)
        
        # Calculate metrics
        print("\n1. Classification Report:")
        print("-" * 60)
        class_names = [self.label_mappings[i] for i in range(len(self.label_mappings))]
        report = classification_report(y_test, y_pred, target_names=class_names, output_dict=True)
        print(classification_report(y_test, y_pred, target_names=class_names))
        
        # Overall metrics
        accuracy = report['accuracy']
        macro_precision = report['macro avg']['precision']
        macro_recall = report['macro avg']['recall']
        macro_f1 = report['macro avg']['f1-score']
        
        print(f"\nOverall Metrics:")
        print(f"  Accuracy: {accuracy:.4f}")
        print(f"  Macro Precision: {macro_precision:.4f}")
        print(f"  Macro Recall: {macro_recall:.4f}")
        print(f"  Macro F1-Score: {macro_f1:.4f}")
        
        # Confusion Matrix
        print("\n2. Confusion Matrix:")
        print("-" * 60)
        cm = confusion_matrix(y_test, y_pred)
        self.plot_confusion_matrix(cm, class_names)
        
        # ROC-AUC (one-vs-rest for multi-class)
        print("\n3. ROC-AUC Score:")
        print("-" * 60)
        try:
            roc_auc = roc_auc_score(y_test, y_pred_proba, multi_class='ovr')
            print(f"ROC-AUC Score: {roc_auc:.4f}")
        except:
            print("ROC-AUC not available for this configuration")
        
        # Per-class metrics
        print("\n4. Per-Class Performance:")
        print("-" * 60)
        for class_name in class_names:
            if class_name in report:
                metrics = report[class_name]
                print(f"\n{class_name}:")
                print(f"  Precision: {metrics['precision']:.4f}")
                print(f"  Recall: {metrics['recall']:.4f}")
                print(f"  F1-Score: {metrics['f1-score']:.4f}")
                print(f"  Support: {metrics['support']}")
        
        # Save evaluation results
        self.save_evaluation_results(report, cm, accuracy, macro_precision, 
                                    macro_recall, macro_f1, class_names)
        
        print("\n" + "=" * 60)
        print("EVALUATION COMPLETED")
        print("=" * 60)
        
        return report
    
    def plot_confusion_matrix(self, cm, class_names):
        """Plot and save confusion matrix"""
        plt.figure(figsize=(10, 8))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                    xticklabels=class_names, yticklabels=class_names)
        plt.title('Confusion Matrix')
        plt.ylabel('True Label')
        plt.xlabel('Predicted Label')
        plt.tight_layout()
        output_path = ML_ROOT / 'training_info/confusion_matrix.png'
        output_path.parent.mkdir(parents=True, exist_ok=True)
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        print(f"Confusion matrix saved to {output_path}")
        plt.close()
    
    def save_evaluation_results(self, report, cm, accuracy, macro_precision,
                                macro_recall, macro_f1, class_names):
        """Save evaluation results to JSON"""
        evaluation_results = {
            'accuracy': float(accuracy),
            'macro_precision': float(macro_precision),
            'macro_recall': float(macro_recall),
            'macro_f1': float(macro_f1),
            'confusion_matrix': cm.tolist(),
            'class_names': class_names,
            'per_class_metrics': {
                class_name: report[class_name] for class_name in class_names
            }
        }
        
        (ML_ROOT / 'training_info').mkdir(parents=True, exist_ok=True)
        with (ML_ROOT / 'training_info/evaluation_results.json').open('w') as f:
            json.dump(evaluation_results, f, indent=2)
        
        print(f"Evaluation results saved to {ML_ROOT / 'training_info/evaluation_results.json'}")
    
    def predict_sample(self, sample_features):
        """
        Make prediction for a single sample
        """
        if self.model is None:
            self.load_model()
        
        # Reshape for single sample
        sample = np.array(sample_features).reshape(1, -1)
        
        # Make prediction
        prediction = self.model.predict(sample, verbose=0)
        predicted_class = np.argmax(prediction[0])
        confidence = float(prediction[0][predicted_class])
        
        # Get top 3 predictions
        top_3_indices = np.argsort(prediction[0])[-3:][::-1]
        top_3_predictions = [
            {
                'class': self.label_mappings[idx],
                'confidence': float(prediction[0][idx])
            }
            for idx in top_3_indices
        ]
        
        result = {
            'predicted_class': self.label_mappings[predicted_class],
            'confidence': confidence,
            'top_predictions': top_3_predictions
        }
        
        return result


def main():
    """Main evaluation pipeline"""
    print("=" * 60)
    print("Healthcare ML Model Evaluation")
    print("=" * 60)
    
    # Initialize evaluator
    evaluator = ModelEvaluator()
    
    # Load test data
    X_test, y_test, feature_names = evaluator.load_test_data()
    
    # Evaluate model
    report = evaluator.evaluate(X_test, y_test)
    
    # Test single prediction
    print("\n" + "=" * 60)
    print("SINGLE PREDICTION TEST")
    print("=" * 60)
    
    sample = X_test[0]
    result = evaluator.predict_sample(sample)
    
    print(f"\nSample prediction:")
    print(f"  Predicted: {result['predicted_class']}")
    print(f"  Confidence: {result['confidence']:.4f}")
    print(f"  Top 3 predictions:")
    for pred in result['top_predictions']:
        print(f"    {pred['class']}: {pred['confidence']:.4f}")
    
    print("\nEvaluation completed successfully!")


if __name__ == '__main__':
    main()
