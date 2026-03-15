#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os
import re
import sys
import json
import numpy as np
import librosa
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL","3")
os.environ.setdefault("PYTHONUNBUFFERED","1")

SR=22050
N_MFCC=40
HEX_RE=re.compile(r"^[0-9a-fA-F]{32}")


def clean(label):
    if isinstance(label,bytes):
        label=label.decode("utf-8",errors="ignore")
    return HEX_RE.sub("",str(label).strip()).lower()


def audio_to_mfcc(audio_raw):
    audio=np.array(audio_raw,dtype=np.float32).squeeze().flatten()
    mx=np.max(np.abs(audio))
    if mx>0:
        audio=audio/mx
    mfcc=librosa.feature.mfcc(y=audio,sr=SR,n_mfcc=N_MFCC)
    return np.mean(mfcc.T,axis=0)


print("[1/5] Загрузка данных Data.npz...")
data=np.load("Data.npz",allow_pickle=True)
X_train=data["train_x"]
X_valid=data["valid_x"]
Y_vaild=np.array([clean(y) for y in data["vaild_y"]])
Y_valid=np.array([clean(y) for y in data["valid_y"]])

X_all=np.concatenate([X_train,X_valid],axis=0)
Y_all=np.concatenate([Y_vaild,Y_valid],axis=0)

classes=sorted(set(Y_valid))
mask=np.array([y in classes for y in Y_all])
X_all=X_all[mask]
Y_all=Y_all[mask]
print(f"      Примеров: {len(X_all)}, классов: {len(classes)}")

le=LabelEncoder()
le.fit(classes)
y_enc=le.transform(Y_all)

print("[2/5] Извлечение MFCC-признаков...")
X_feat=np.array([audio_to_mfcc(x) for x in X_all],dtype=np.float32)
print(f"      Форма признаков: {X_feat.shape}")

X_tr,X_te,y_tr,y_te=train_test_split(
    X_feat,y_enc,test_size=0.2,stratify=y_enc,random_state=42
)

import tensorflow as tf
tf.get_logger().setLevel("ERROR")

print("[3/5] Сборка модели...")
model=tf.keras.Sequential([
    tf.keras.layers.Input(shape=(N_MFCC,)),
    tf.keras.layers.Dense(128,activation="relu"),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(64,activation="relu"),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(len(classes),activation="softmax"),
])
model.compile(
    optimizer="adam",
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)

print("[4/5] Обучение (early stopping по val_accuracy, patience=10)...")
history=model.fit(
    X_tr,y_tr,
    validation_data=(X_te,y_te),
    epochs=50,
    batch_size=32,
    callbacks=[
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",patience=10,restore_best_weights=True
        ),
    ],
    verbose=1,
)
best_epoch = np.argmax(history.history["val_accuracy"]) + 1
print(f"      Лучшая эпоха: {best_epoch}, val_accuracy: {history.history['val_accuracy'][best_epoch-1]:.4f}")

print("[5/5] Сохранение артефактов...")
model.save("model.h5")
print("      model.h5")

with open("classes.json","w",encoding="utf-8") as f:
    json.dump({str(i):c for i,c in enumerate(classes)},f,ensure_ascii=False,indent=2)

with open("training_history.json","w",encoding="utf-8") as f:
    json.dump({
        "accuracy":history.history.get("accuracy",[]),
        "val_accuracy":history.history.get("val_accuracy",[]),
        "loss":history.history.get("loss",[]),
        "val_loss":history.history.get("val_loss",[]),
    },f)

class_counts={c:int(np.sum(Y_all==c)) for c in classes}
top5=dict(sorted(class_counts.items(),key=lambda x:-x[1])[:5])
with open("stats.json","w",encoding="utf-8") as f:
    json.dump({
        "train_distribution":class_counts,
        "valid_top5":top5,
        "total_train":len(Y_all),
        "n_classes":len(classes),
    },f,ensure_ascii=False,indent=2)
print("      classes.json, training_history.json, stats.json")
print("Готово.")
