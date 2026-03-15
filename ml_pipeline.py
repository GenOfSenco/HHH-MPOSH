#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os
import re
import json
import numpy as np
import librosa
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("PYTHONUNBUFFERED", "1")

SR = 22050
N_MFCC = 40
HEX_RE = re.compile(r"^[0-9a-fA-F]{32}")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(SCRIPT_DIR, "artifacts")


def clean(label):
    if isinstance(label, bytes):
        label = label.decode("utf-8", errors="ignore")
    return HEX_RE.sub("", str(label).strip()).lower()


def estimate_global_noise_profile(audio_samples, sr=SR, n_samples=80):
    rng = np.random.RandomState(42)
    indices = rng.choice(len(audio_samples), min(n_samples, len(audio_samples)), replace=False)
    noise_profiles = []
    for i in indices:
        s = np.array(audio_samples[i], dtype=np.float32).squeeze().flatten()
        s = s - np.mean(s)
        mx = np.max(np.abs(s))
        if mx > 0:
            s = s / mx
        stft = librosa.stft(s)
        mag = np.abs(stft)
        frame_energy = np.sum(mag ** 2, axis=0)
        n_quiet = max(1, int(len(frame_energy) * 0.10))
        quiet_idx = np.argsort(frame_energy)[:n_quiet]
        noise_profiles.append(np.mean(mag[:, quiet_idx], axis=1))
    return np.mean(noise_profiles, axis=0)


def clean_audio(audio_raw, sr=SR, noise_profile=None):
    audio = np.array(audio_raw, dtype=np.float32).squeeze().flatten()

    audio = audio - np.mean(audio)

    mx = np.max(np.abs(audio))
    if mx > 0:
        audio = audio / mx

    if noise_profile is not None:
        stft = librosa.stft(audio)
        mag = np.abs(stft)
        phase = np.angle(stft)
        clean_mag = np.maximum(mag - noise_profile[:, np.newaxis], 0.0)
        audio = librosa.istft(clean_mag * np.exp(1j * phase), length=len(audio))

    trimmed, _ = librosa.effects.trim(audio, top_db=30)
    if len(trimmed) > int(sr * 0.1):
        audio = trimmed

    mx = np.max(np.abs(audio))
    if mx > 0:
        audio = audio / mx

    return audio


def audio_to_features(audio, sr=SR, n_mfcc=N_MFCC):
    min_len = int(sr * 0.5)
    if len(audio) < min_len:
        audio = np.pad(audio, (0, min_len - len(audio)))
    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=n_mfcc)
    n_frames = mfcc.shape[1]
    w = min(9, n_frames if n_frames % 2 == 1 else n_frames - 1)
    w = max(w, 3)
    delta = librosa.feature.delta(mfcc, width=w)
    delta2 = librosa.feature.delta(mfcc, order=2, width=w)
    return np.concatenate([
        np.mean(mfcc.T, axis=0),
        np.std(mfcc.T, axis=0),
        np.mean(delta.T, axis=0),
        np.mean(delta2.T, axis=0),
    ])


print("[1/5] Загрузка данных Data.npz ...")
data = np.load("Data.npz", allow_pickle=True)
X_train = data["train_x"]
X_valid = data["valid_x"]
Y_train = np.array([clean(y) for y in data["train_y"]])
Y_valid = np.array([clean(y) for y in data["valid_y"]])

X_all = np.concatenate([X_train, X_valid], axis=0)
Y_all = np.concatenate([Y_train, Y_valid], axis=0)

classes = sorted(set(Y_all))
mask = np.array([y in classes for y in Y_all])
X_all = X_all[mask]
Y_all = Y_all[mask]
print(f"      Примеров: {len(X_all)}, классов: {len(classes)}")

le = LabelEncoder()
le.fit(classes)
y_enc = le.transform(Y_all)

print("[2/5] Очистка аудио + извлечение признаков ...")
noise_profile = estimate_global_noise_profile(X_all, sr=SR, n_samples=100)
print("      Глобальный профиль шума рассчитан")

features = []
for i, x in enumerate(X_all):
    audio = clean_audio(x, sr=SR, noise_profile=noise_profile)
    feat = audio_to_features(audio, sr=SR, n_mfcc=N_MFCC)
    features.append(feat)
    if (i + 1) % 200 == 0:
        print(f"      Обработано {i + 1}/{len(X_all)}")

X_feat = np.array(features, dtype=np.float32)
print(f"      Форма признаков: {X_feat.shape}")

X_tr, X_te, y_tr, y_te = train_test_split(
    X_feat, y_enc, test_size=0.2, stratify=y_enc, random_state=42
)

import tensorflow as tf
tf.get_logger().setLevel("ERROR")

feature_dim = X_feat.shape[1]

print("[3/5] Сборка модели ...")
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(feature_dim,)),
    tf.keras.layers.Dense(256, activation="relu"),
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(128, activation="relu"),
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(64, activation="relu"),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(len(classes), activation="softmax"),
])
model.compile(
    optimizer="adam",
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)

print("[4/5] Обучение (early stopping по val_accuracy, patience=10) ...")
history = model.fit(
    X_tr, y_tr,
    validation_data=(X_te, y_te),
    epochs=100,
    batch_size=32,
    callbacks=[
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=10, restore_best_weights=True
        ),
    ],
    verbose=1,
)
best_epoch = np.argmax(history.history["val_accuracy"]) + 1
print(f"      Лучшая эпоха: {best_epoch}, "
      f"val_accuracy: {history.history['val_accuracy'][best_epoch - 1]:.4f}")

print(f"[5/5] Сохранение артефактов в {ARTIFACTS_DIR} ...")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

model.save(os.path.join(ARTIFACTS_DIR, "model.h5"))
print("      model.h5")

with open(os.path.join(ARTIFACTS_DIR, "classes.json"), "w", encoding="utf-8") as f:
    json.dump({str(i): c for i, c in enumerate(classes)}, f, ensure_ascii=False, indent=2)

with open(os.path.join(ARTIFACTS_DIR, "training_history.json"), "w", encoding="utf-8") as f:
    json.dump({
        "accuracy": [float(v) for v in history.history.get("accuracy", [])],
        "val_accuracy": [float(v) for v in history.history.get("val_accuracy", [])],
        "loss": [float(v) for v in history.history.get("loss", [])],
        "val_loss": [float(v) for v in history.history.get("val_loss", [])],
    }, f)

class_counts = {c: int(np.sum(Y_all == c)) for c in classes}
top5 = dict(sorted(class_counts.items(), key=lambda x: -x[1])[:5])
with open(os.path.join(ARTIFACTS_DIR, "stats.json"), "w", encoding="utf-8") as f:
    json.dump({
        "train_distribution": class_counts,
        "valid_top5": top5,
        "total_train": len(Y_all),
        "n_classes": len(classes),
    }, f, ensure_ascii=False, indent=2)

print("      classes.json, training_history.json, stats.json")
print(f"\nВсе артефакты сохранены в: {ARTIFACTS_DIR}")
print("Готово.")
