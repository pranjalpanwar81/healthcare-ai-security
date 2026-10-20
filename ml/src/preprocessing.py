"""
Data Preprocessing Module for Healthcare ML
Handles data loading, cleaning, and splitting
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
import json
import os
from pathlib import Path


class DataPreprocessor:
    """Handle all data preprocessing tasks"""
    
    def __init__(self, data_dir=None):
        if data_dir is None:
            data_dir = Path(__file__).resolve().parents[1] / 'data'
        requested_dir = Path(data_dir)
        self.data_dir = (requested_dir if requested_dir.is_absolute() else
                         Path(__file__).resolve().parents[1] / requested_dir).resolve()
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.label_mappings = {}
        
    def generate_synthetic_data(self, num_samples=10000):
        """
        Generate synthetic healthcare data for training
        This creates realistic medical records for model training
        """
        np.random.seed(42)
        
        # Define medical conditions and their symptom patterns
        conditions = {
            'healthy': {
                'symptoms': ['none', 'mild fatigue'],
                'temp_range': (36.5, 37.2),
                'bp_range': (110, 120),
                'hr_range': (60, 80),
                'wbc_range': (4000, 10000),
                'probability': 0.3
            },
            'viral_infection': {
                'symptoms': ['fever', 'fatigue', 'headache', 'body_ache', 'sore_throat'],
                'temp_range': (37.5, 39.5),
                'bp_range': (110, 130),
                'hr_range': (80, 100),
                'wbc_range': (8000, 15000),
                'probability': 0.25
            },
            'bacterial_infection': {
                'symptoms': ['high_fever', 'chills', 'severe_fatigue', 'localized_pain'],
                'temp_range': (38.5, 40.5),
                'bp_range': (100, 140),
                'hr_range': (90, 120),
                'wbc_range': (12000, 25000),
                'probability': 0.2
            },
            'hypertension': {
                'symptoms': ['headache', 'dizziness', 'blurred_vision', 'none'],
                'temp_range': (36.5, 37.2),
                'bp_range': (140, 180),
                'hr_range': (70, 90),
                'wbc_range': (5000, 10000),
                'probability': 0.15
            },
            'diabetes_complication': {
                'symptoms': ['increased_thirst', 'frequent_urination', 'fatigue', 'blurred_vision'],
                'temp_range': (36.5, 37.5),
                'bp_range': (120, 150),
                'hr_range': (70, 95),
                'wbc_range': (6000, 12000),
                'probability': 0.1
            }
        }
        
        data = []
        condition_labels = []
        
        for _ in range(num_samples):
            # Select condition based on probability
            rand = np.random.random()
            cumulative = 0
            selected_condition = 'healthy'
            
            for condition, info in conditions.items():
                cumulative += info['probability']
                if rand <= cumulative:
                    selected_condition = condition
                    break
            
            condition_info = conditions[selected_condition]
            
            # Generate symptoms
            num_symptoms = np.random.randint(0, len(condition_info['symptoms']))
            symptoms = np.random.choice(condition_info['symptoms'], 
                                        min(num_symptoms + 1, len(condition_info['symptoms'])),
                                        replace=False)
            
            # Generate vitals
            temperature = np.random.uniform(*condition_info['temp_range'])
            systolic_bp = np.random.randint(*condition_info['bp_range'])
            diastolic_bp = int(systolic_bp * (0.6 + np.random.uniform(-0.05, 0.05)))
            heart_rate = np.random.randint(*condition_info['hr_range'])
            wbc_count = np.random.randint(*condition_info['wbc_range'])
            hemoglobin = np.random.uniform(12.0, 16.0)
            
            # Additional features
            age = np.random.randint(18, 80)
            gender = np.random.choice(['male', 'female'])
            bmi = np.random.uniform(18.5, 35.0)
            
            # Create feature vector
            sample = {
                'age': age,
                'gender': gender,
                'bmi': bmi,
                'temperature': round(temperature, 1),
                'systolic_bp': systolic_bp,
                'diastolic_bp': diastolic_bp,
                'heart_rate': heart_rate,
                'wbc_count': wbc_count,
                'hemoglobin': round(hemoglobin, 1),
                'symptoms': ','.join(symptoms),
                'condition': selected_condition
            }
            
            data.append(sample)
            condition_labels.append(selected_condition)
        
        df = pd.DataFrame(data)
        return df
    
    def clean_data(self, df):
        """
        Clean and preprocess the data
        """
        # Handle missing values
        df = df.fillna(df.mean(numeric_only=True))
        
        # Encode categorical variables
        if 'gender' in df.columns:
            df['gender'] = df['gender'].map({'male': 0, 'female': 1})
        
        # Extract symptom features
        if 'symptoms' in df.columns:
            symptom_list = ['fever', 'headache', 'fatigue', 'body_ache', 'sore_throat', 
                          'chills', 'dizziness', 'blurred_vision', 'increased_thirst',
                          'frequent_urination', 'localized_pain', 'high_fever', 'severe_fatigue', 'none']
            
            for symptom in symptom_list:
                df[f'symptom_{symptom}'] = df['symptoms'].apply(
                    lambda x: 1 if symptom in str(x).split(',') else 0
                )
            
            df = df.drop('symptoms', axis=1)
        
        return df
    
    def prepare_features(self, df, target_column='condition'):
        """
        Prepare features and target for training
        """
        # Separate features and target
        X = df.drop(columns=[target_column])
        y = df[target_column]
        
        # Encode target labels
        y_encoded = self.label_encoder.fit_transform(y)
        
        # Store label mappings (convert to regular dict with int keys)
        self.label_mappings = dict(enumerate(self.label_encoder.classes_))
        
        # Get feature names
        feature_names = X.columns.tolist()
        
        return X.values, y_encoded, feature_names
    
    def split_data(self, X, y, train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, stratify=True):
        """
        Split data into train, validation, and test sets
        """
        if stratify:
            # First split: train + val vs test
            X_train_val, X_test, y_train_val, y_test = train_test_split(
                X, y, 
                test_size=test_ratio, 
                random_state=42,
                stratify=y
            )
            
            # Second split: train vs val
            val_adjusted_ratio = val_ratio / (train_ratio + val_ratio)
            X_train, X_val, y_train, y_val = train_test_split(
                X_train_val, y_train_val,
                test_size=val_adjusted_ratio,
                random_state=42,
                stratify=y_train_val
            )
        else:
            X_train_val, X_test, y_train_val, y_test = train_test_split(
                X, y, test_size=test_ratio, random_state=42
            )
            
            val_adjusted_ratio = val_ratio / (train_ratio + val_ratio)
            X_train, X_val, y_train, y_val = train_test_split(
                X_train_val, y_train_val, test_size=val_adjusted_ratio, random_state=42
            )
        
        print(f"Data split completed:")
        print(f"  Training: {X_train.shape[0]} samples ({train_ratio*100:.0f}%)")
        print(f"  Validation: {X_val.shape[0]} samples ({val_ratio*100:.0f}%)")
        print(f"  Test: {X_test.shape[0]} samples ({test_ratio*100:.0f}%)")
        
        return X_train, X_val, X_test, y_train, y_val, y_test
    
    def scale_features(self, X_train, X_val=None, X_test=None):
        """
        Scale features using StandardScaler
        """
        X_train_scaled = self.scaler.fit_transform(X_train)
        
        result = {'X_train': X_train_scaled}
        
        if X_val is not None:
            result['X_val'] = self.scaler.transform(X_val)
        
        if X_test is not None:
            result['X_test'] = self.scaler.transform(X_test)
        
        return result

    def save_scaler(self, output_path=None):
        """Persist the fitted feature scaling parameters for inference."""
        output_path = Path(output_path) if output_path else self.data_dir.parent / 'training_info/scaler.json'
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open('w') as f:
            json.dump({
                'mean': self.scaler.mean_.tolist(),
                'scale': self.scaler.scale_.tolist(),
                'var': self.scaler.var_.tolist(),
                'n_samples_seen': int(self.scaler.n_samples_seen_),
            }, f, indent=2)
    
    def save_preprocessed_data(self, X_train, X_val, X_test, y_train, y_val, y_test, 
                             feature_names, label_mappings):
        """
        Save preprocessed data to disk
        """
        split_dir = self.data_dir / 'train_test_split'
        split_dir.mkdir(parents=True, exist_ok=True)
        
        data_dict = {
            'X_train': X_train.tolist(),
            'X_val': X_val.tolist(),
            'X_test': X_test.tolist(),
            'y_train': y_train.tolist(),
            'y_val': y_val.tolist(),
            'y_test': y_test.tolist(),
            'feature_names': feature_names,
            'label_mappings': label_mappings
        }
        
        with (split_dir / 'preprocessed_data.json').open('w') as f:
            json.dump(data_dict, f)
        
        print(f"Preprocessed data saved to {split_dir / 'preprocessed_data.json'}")
    
    def load_preprocessed_data(self):
        """
        Load preprocessed data from disk
        """
        with (self.data_dir / 'train_test_split/preprocessed_data.json').open('r') as f:
            data_dict = json.load(f)
        
        return (
            np.array(data_dict['X_train']),
            np.array(data_dict['X_val']),
            np.array(data_dict['X_test']),
            np.array(data_dict['y_train']),
            np.array(data_dict['y_val']),
            np.array(data_dict['y_test']),
            data_dict['feature_names'],
            data_dict['label_mappings']
        )


def main():
    """Main preprocessing pipeline"""
    print("=" * 60)
    print("Healthcare ML Data Preprocessing Pipeline")
    print("=" * 60)
    
    # Initialize preprocessor
    preprocessor = DataPreprocessor()
    
    # Generate synthetic data
    print("\n[1/5] Generating synthetic healthcare data...")
    df = preprocessor.generate_synthetic_data(num_samples=10000)
    print(f"Generated {len(df)} samples")
    print(f"Class distribution:\n{df['condition'].value_counts()}")
    
    # Save raw data
    (preprocessor.data_dir / 'raw').mkdir(parents=True, exist_ok=True)
    df.to_csv(preprocessor.data_dir / 'raw/synthetic_healthcare_data.csv', index=False)
    print("Raw data saved to ../data/raw/synthetic_healthcare_data.csv")
    
    # Clean data
    print("\n[2/5] Cleaning data...")
    df_clean = preprocessor.clean_data(df)
    print(f"Cleaned data shape: {df_clean.shape}")
    
    # Save processed data
    (preprocessor.data_dir / 'processed').mkdir(parents=True, exist_ok=True)
    df_clean.to_csv(preprocessor.data_dir / 'processed/cleaned_healthcare_data.csv', index=False)
    print("Cleaned data saved to ../data/processed/cleaned_healthcare_data.csv")
    
    # Prepare features
    print("\n[3/5] Preparing features...")
    X, y, feature_names = preprocessor.prepare_features(df_clean)
    print(f"Features: {feature_names}")
    print(f"Number of classes: {len(preprocessor.label_mappings)}")
    print(f"Label mappings: {preprocessor.label_mappings}")
    
    # Split data
    print("\n[4/5] Splitting data...")
    X_train, X_val, X_test, y_train, y_val, y_test = preprocessor.split_data(
        X, y, train_ratio=0.70, val_ratio=0.15, test_ratio=0.15
    )
    
    # Scale features
    print("\n[5/5] Scaling features...")
    scaled_data = preprocessor.scale_features(X_train, X_val, X_test)
    preprocessor.save_scaler()
    
    # Save preprocessed data
    preprocessor.save_preprocessed_data(
        scaled_data['X_train'],
        scaled_data['X_val'],
        scaled_data['X_test'],
        y_train, y_val, y_test,
        feature_names,
        preprocessor.label_mappings
    )
    
    print("\n" + "=" * 60)
    print("Preprocessing completed successfully!")
    print("=" * 60)


if __name__ == '__main__':
    main()
