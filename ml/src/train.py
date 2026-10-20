"""
Training Script for Healthcare ML Model
Handles model training with multiple epochs and comprehensive monitoring
"""

import tensorflow as tf
from tensorflow import keras
import numpy as np
import matplotlib.pyplot as plt
import json
import os
from pathlib import Path
from datetime import datetime
from model import HealthcareModel
from preprocessing import DataPreprocessor

ML_ROOT = Path(__file__).resolve().parents[1]


class ModelTrainer:
    """Handle model training with extensive epochs and monitoring"""
    
    def __init__(self, model_path=None, checkpoint_path=None):
        self.model_path = Path(model_path) if model_path else ML_ROOT / 'models/saved/healthcare_model.h5'
        self.checkpoint_path = Path(checkpoint_path) if checkpoint_path else ML_ROOT / 'models/checkpoints/best_model.h5'
        self.model = None
        self.history = None
        
    def load_data(self):
        """Load preprocessed data"""
        print("Loading preprocessed data...")
        preprocessor = DataPreprocessor()
        
        X_train, X_val, X_test, y_train, y_val, y_test, feature_names, label_mappings = \
            preprocessor.load_preprocessed_data()
        
        print(f"Training samples: {X_train.shape[0]}")
        print(f"Validation samples: {X_val.shape[0]}")
        print(f"Test samples: {X_test.shape[0]}")
        print(f"Features: {len(feature_names)}")
        print(f"Classes: {label_mappings}")
        
        return (X_train, X_val, X_test, y_train, y_val, y_test, 
                feature_names, label_mappings)
    
    def train_model(self, X_train, y_train, X_val, y_val, 
                    num_classes, feature_names, label_mappings,
                    architecture='deep',
                    epochs=100,
                    batch_size=32,
                    initial_lr=0.001):
        """
        Train the model with multiple epochs for best accuracy
        
        Args:
            X_train, y_train: Training data
            X_val, y_val: Validation data
            num_classes: Number of output classes
            feature_names: List of feature names
            label_mappings: Dictionary of label mappings
            architecture: Model architecture ('simple', 'deep', 'residual')
            epochs: Number of training epochs (high for best accuracy)
            batch_size: Batch size for training
            initial_lr: Initial learning rate
        """
        print("\n" + "=" * 60)
        print("MODEL TRAINING")
        print("=" * 60)
        print(f"Architecture: {architecture}")
        print(f"Epochs: {epochs}")
        print(f"Batch size: {batch_size}")
        print(f"Initial learning rate: {initial_lr}")
        print("=" * 60)
        
        # Build model
        print("\nBuilding model...")
        model_builder = HealthcareModel(
            input_shape=X_train.shape[1:],
            num_classes=num_classes,
            learning_rate=initial_lr
        )
        
        self.model = model_builder.build_model(architecture=architecture)
        model_builder.summary()
        
        # Create directories
        (ML_ROOT / 'models/saved').mkdir(parents=True, exist_ok=True)
        (ML_ROOT / 'models/checkpoints').mkdir(parents=True, exist_ok=True)
        (ML_ROOT / 'logs').mkdir(parents=True, exist_ok=True)
        (ML_ROOT / 'training_info').mkdir(parents=True, exist_ok=True)
        
        # Get callbacks
        callbacks = model_builder.get_callbacks(
            model_path=self.checkpoint_path,
            patience=15,
            monitor='val_loss'
        )
        
        # Train model
        print("\nStarting training...")
        print(f"Training on {X_train.shape[0]} samples for {epochs} epochs")
        
        self.history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        # Save final model
        print("\nSaving final model...")
        model_builder.save_model(self.model_path)
        
        # Save training info
        self.save_training_info(architecture, epochs, batch_size, 
                               initial_lr, feature_names, label_mappings)
        
        # Plot training history
        self.plot_training_history()
        
        print("\n" + "=" * 60)
        print("TRAINING COMPLETED")
        print("=" * 60)
        
        return self.history
    
    def save_training_info(self, architecture, epochs, batch_size, 
                          initial_lr, feature_names, label_mappings):
        """Save training configuration and results"""
        training_info = {
            'timestamp': datetime.now().isoformat(),
            'architecture': architecture,
            'epochs': epochs,
            'batch_size': batch_size,
            'initial_learning_rate': initial_lr,
            'final_accuracy': float(self.history.history['accuracy'][-1]),
            'final_val_accuracy': float(self.history.history['val_accuracy'][-1]),
            'final_loss': float(self.history.history['loss'][-1]),
            'final_val_loss': float(self.history.history['val_loss'][-1]),
            'best_val_accuracy': float(max(self.history.history['val_accuracy'])),
            'feature_names': feature_names,
            'label_mappings': label_mappings,
            'training_history': {
                'accuracy': [float(x) for x in self.history.history['accuracy']],
                'val_accuracy': [float(x) for x in self.history.history['val_accuracy']],
                'loss': [float(x) for x in self.history.history['loss']],
                'val_loss': [float(x) for x in self.history.history['val_loss']]
            }
        }
        
        with (ML_ROOT / 'training_info/training_info.json').open('w') as f:
            json.dump(training_info, f, indent=2)
        
        print(f"Training info saved to {ML_ROOT / 'training_info/training_info.json'}")
    
    def plot_training_history(self):
        """Plot and save training history"""
        fig, axes = plt.subplots(1, 2, figsize=(15, 5))
        
        # Plot accuracy
        axes[0].plot(self.history.history['accuracy'], label='Training Accuracy')
        axes[0].plot(self.history.history['val_accuracy'], label='Validation Accuracy')
        axes[0].set_title('Model Accuracy')
        axes[0].set_xlabel('Epoch')
        axes[0].set_ylabel('Accuracy')
        axes[0].legend()
        axes[0].grid(True)
        
        # Plot loss
        axes[1].plot(self.history.history['loss'], label='Training Loss')
        axes[1].plot(self.history.history['val_loss'], label='Validation Loss')
        axes[1].set_title('Model Loss')
        axes[1].set_xlabel('Epoch')
        axes[1].set_ylabel('Loss')
        axes[1].legend()
        axes[1].grid(True)
        
        plt.tight_layout()
        plt.savefig(ML_ROOT / 'training_info/training_history.png', dpi=150, bbox_inches='tight')
        print(f"Training history plot saved to {ML_ROOT / 'training_info/training_history.png'}")
        plt.close()
    
    def train_with_hyperparameter_tuning(self, X_train, y_train, X_val, y_val,
                                       num_classes, feature_names, label_mappings):
        """
        Train with multiple hyperparameter combinations for best results
        """
        print("\n" + "=" * 60)
        print("HYPERPARAMETER TUNING")
        print("=" * 60)
        
        # Define hyperparameter grid
        learning_rates = [0.001, 0.0005, 0.0001]
        batch_sizes = [16, 32, 64]
        architectures = ['deep', 'residual']
        
        best_accuracy = 0
        best_config = None
        best_model = None
        
        for arch in architectures:
            for lr in learning_rates:
                for bs in batch_sizes:
                    print(f"\n{'='*60}")
                    print(f"Testing: arch={arch}, lr={lr}, batch_size={bs}")
                    print(f"{'='*60}")
                    
                    # Build and train model
                    model_builder = HealthcareModel(
                        input_shape=X_train.shape[1:],
                        num_classes=num_classes,
                        learning_rate=lr
                    )
                    
                    model = model_builder.build_model(architecture=arch)
                    
                    callbacks = [
                        keras.callbacks.EarlyStopping(
                            monitor='val_loss',
                            patience=10,
                            restore_best_weights=True,
                            verbose=0
                        )
                    ]
                    
                    history = model.fit(
                        X_train, y_train,
                        validation_data=(X_val, y_val),
                        epochs=50,  # Fewer epochs for tuning
                        batch_size=bs,
                        callbacks=callbacks,
                        verbose=0
                    )
                    
                    val_accuracy = max(history.history['val_accuracy'])
                    print(f"Validation Accuracy: {val_accuracy:.4f}")
                    
                    if val_accuracy > best_accuracy:
                        best_accuracy = val_accuracy
                        best_config = {
                            'architecture': arch,
                            'learning_rate': lr,
                            'batch_size': bs
                        }
                        best_model = model
        
        print(f"\n{'='*60}")
        print(f"BEST CONFIGURATION FOUND")
        print(f"{'='*60}")
        print(f"Architecture: {best_config['architecture']}")
        print(f"Learning Rate: {best_config['learning_rate']}")
        print(f"Batch Size: {best_config['batch_size']}")
        print(f"Best Validation Accuracy: {best_accuracy:.4f}")
        
        # Train final model with best config
        print("\nTraining final model with best configuration...")
        self.train_model(
            X_train, y_train, X_val, y_val,
            num_classes, feature_names, label_mappings,
            architecture=best_config['architecture'],
            epochs=100,  # More epochs for final training
            batch_size=best_config['batch_size'],
            initial_lr=best_config['learning_rate']
        )
        
        return best_config


def main():
    """Main training pipeline"""
    print("=" * 60)
    print("Healthcare ML Model Training Pipeline")
    print("=" * 60)
    
    # Initialize trainer
    trainer = ModelTrainer()
    
    # Load data
    X_train, X_val, X_test, y_train, y_val, y_test, feature_names, label_mappings = \
        trainer.load_data()
    
    num_classes = len(label_mappings)
    
    # Train model with extensive epochs
    trainer.train_model(
        X_train, y_train, X_val, y_val,
        num_classes, feature_names, label_mappings,
        architecture='deep',  # Use deep architecture for best results
        epochs=100,  # Many epochs for best accuracy
        batch_size=32,
        initial_lr=0.001
    )
    
    # Alternative: Use hyperparameter tuning
    # trainer.train_with_hyperparameter_tuning(
    #     X_train, y_train, X_val, y_val,
    #     num_classes, feature_names, label_mappings
    # )
    
    print("\nTraining completed successfully!")
    print(f"Model saved to {ML_ROOT / 'models/saved/healthcare_model.h5'}")


if __name__ == '__main__':
    main()
