"""
Neural Network Model Architecture for Healthcare Diagnosis
Deep learning model for multi-class medical condition prediction
"""

import tensorflow as tf
from pathlib import Path
from tensorflow import keras

ML_ROOT = Path(__file__).resolve().parents[1]
from tensorflow.keras import layers, regularizers
import numpy as np


class HealthcareModel:
    """Healthcare diagnosis prediction model"""
    
    def __init__(self, input_shape, num_classes, learning_rate=0.001):
        self.input_shape = input_shape
        self.num_classes = num_classes
        self.learning_rate = learning_rate
        self.model = None
        
    def build_model(self, architecture='deep'):
        """
        Build neural network model
        
        Args:
            architecture: 'simple', 'deep', or 'residual'
        """
        if architecture == 'simple':
            self.model = self._build_simple_model()
        elif architecture == 'deep':
            self.model = self._build_deep_model()
        elif architecture == 'residual':
            self.model = self._build_residual_model()
        else:
            raise ValueError(f"Unknown architecture: {architecture}")
        
        return self.model
    
    def _build_simple_model(self):
        """Simple feedforward neural network"""
        model = keras.Sequential([
            layers.Input(shape=self.input_shape),
            
            # First hidden layer
            layers.Dense(64, activation='relu'),
            layers.Dropout(0.3),
            
            # Second hidden layer
            layers.Dense(32, activation='relu'),
            layers.Dropout(0.2),
            
            # Output layer
            layers.Dense(self.num_classes, activation='softmax')
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        return model
    
    def _build_deep_model(self):
        """Deep neural network with multiple layers"""
        model = keras.Sequential([
            layers.Input(shape=self.input_shape),
            
            # First block
            layers.Dense(256, activation='relu', kernel_regularizer=regularizers.l2(0.01)),
            layers.BatchNormalization(),
            layers.Dropout(0.4),
            
            # Second block
            layers.Dense(128, activation='relu', kernel_regularizer=regularizers.l2(0.01)),
            layers.BatchNormalization(),
            layers.Dropout(0.3),
            
            # Third block
            layers.Dense(64, activation='relu', kernel_regularizer=regularizers.l2(0.01)),
            layers.BatchNormalization(),
            layers.Dropout(0.3),
            
            # Fourth block
            layers.Dense(32, activation='relu'),
            layers.Dropout(0.2),
            
            # Output layer
            layers.Dense(self.num_classes, activation='softmax')
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        return model
    
    def _build_residual_model(self):
        """Residual neural network for better gradient flow"""
        inputs = layers.Input(shape=self.input_shape)
        
        # Initial layer
        x = layers.Dense(128, activation='relu')(inputs)
        x = layers.BatchNormalization()(x)
        
        # Residual block 1
        shortcut = x
        x = layers.Dense(128, activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.3)(x)
        x = layers.Dense(128, activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.add([x, shortcut])
        
        # Residual block 2
        shortcut = x
        x = layers.Dense(64, activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.3)(x)
        x = layers.Dense(64, activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.add([x, shortcut])
        
        # Final layers
        x = layers.Dense(32, activation='relu')(x)
        x = layers.Dropout(0.2)(x)
        
        # Output
        outputs = layers.Dense(self.num_classes, activation='softmax')(x)
        
        model = keras.Model(inputs=inputs, outputs=outputs)
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        return model
    
    def get_callbacks(self, model_path, patience=10, monitor='val_loss'):
        """
        Get training callbacks for best performance
        """
        callbacks = [
            # Early stopping to prevent overfitting
            keras.callbacks.EarlyStopping(
                monitor=monitor,
                patience=patience,
                restore_best_weights=True,
                verbose=1
            ),
            
            # Model checkpointing
            keras.callbacks.ModelCheckpoint(
                filepath=model_path,
                monitor=monitor,
                save_best_only=True,
                verbose=1
            ),
            
            # Reduce learning rate when plateau
            keras.callbacks.ReduceLROnPlateau(
                monitor=monitor,
                factor=0.5,
                patience=5,
                min_lr=1e-7,
                verbose=1
            ),
            
            # TensorBoard for visualization
            keras.callbacks.TensorBoard(
                log_dir=str(ML_ROOT / 'logs'),
                histogram_freq=1
            )
        ]
        
        return callbacks
    
    def summary(self):
        """Print model summary"""
        if self.model:
            self.model.summary()
        else:
            print("Model not built yet. Call build_model() first.")
    
    def save_model(self, path):
        """Save model to disk"""
        if self.model:
            self.model.save(path)
            print(f"Model saved to {path}")
        else:
            print("No model to save.")
    
    def load_model(self, path):
        """Load model from disk"""
        self.model = keras.models.load_model(path)
        print(f"Model loaded from {path}")
        return self.model


def main():
    """Test model architecture"""
    print("=" * 60)
    print("Testing Healthcare Model Architecture")
    print("=" * 60)
    
    # Create dummy data
    input_shape = (17,)  # Number of features
    num_classes = 5  # Number of conditions
    
    # Test different architectures
    for arch in ['simple', 'deep', 'residual']:
        print(f"\n{arch.upper()} Architecture:")
        print("-" * 60)
        
        model_builder = HealthcareModel(input_shape, num_classes)
        model = model_builder.build_model(architecture=arch)
        model_builder.summary()
        
        # Test forward pass
        dummy_input = np.random.random((10, *input_shape))
        output = model.predict(dummy_input, verbose=0)
        print(f"Output shape: {output.shape}")
        print(f"Sample prediction: {output[0]}")


if __name__ == '__main__':
    main()
