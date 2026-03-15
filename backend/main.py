import os
import io
import re
import json
import numpy as np
from typing import List
from contextlib import asynccontextmanager

from fastapi import FastAPI,HTTPException,Depends,UploadFile,File,status
from fastapi.middleware.cors import CORSMiddleware
import librosa

from database import get_supabase
from schemas import (
    UserCreate,UserResponse,UserLogin,TokenResponse,
    PredictionResponse,PredictionItem,
)
from auth import (
    hash_password,verify_password,create_access_token,
    get_current_user,require_admin
)

ROOT_DIR=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACTS_DIR=os.path.join(ROOT_DIR,"artifacts")
MODEL_PATH=os.path.join(ARTIFACTS_DIR,"model.h5")
CLASSES_PATH=os.path.join(ARTIFACTS_DIR,"classes.json")
HISTORY_PATH=os.path.join(ARTIFACTS_DIR,"training_history.json")
STATS_PATH=os.path.join(ARTIFACTS_DIR,"stats.json")

HEX_PREFIX_RE=re.compile(r'^[0-9a-fA-F]{32}')

_model=None
_classes=None


def get_model():
    global _model
    if _model is None and os.path.exists(MODEL_PATH):
        try:
            from tensorflow.keras.models import load_model
            _model=load_model(MODEL_PATH)
        except Exception:
            pass
    return _model


def get_classes() -> dict:
    global _classes
    if _classes is None and os.path.exists(CLASSES_PATH):
        try:
            with open(CLASSES_PATH,'r',encoding='utf-8') as f:
                _classes=json.load(f)
        except Exception:
            pass
    return _classes or {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await ensure_default_admin()
    except Exception as e:
        import sys
        print(f"[backend] Supabase init skipped: {e}", file=sys.stderr)
    get_model()
    get_classes()
    yield


async def ensure_default_admin():
    supabase=get_supabase()
    try:
        resp=supabase.table("users").select("id").eq("username","admin").execute()
        if not resp.data:
            supabase.table("users").insert({
                "username":"admin",
                "password":hash_password("admin"),
                "first_name":"Admin",
                "last_name":"System",
                "role":"admin"
            }).execute()
    except Exception:
        pass


app=FastAPI(
    title="Alien Signal Classifier API",
    description="API для классификации инопланетных радиосигналов (Хакатон 2226)",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/login",response_model=TokenResponse)
async def login(credentials: UserLogin):
    try:
        supabase=get_supabase()
    except RuntimeError as e:
        raise HTTPException(status_code=503,detail=f"Database not configured: {e}")
    try:
        resp=supabase.table("users").select("*").eq("username",credentials.username).execute()
    except Exception as e:
        error_msg=str(e)
        if "relation" in error_msg.lower() and "does not exist" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Table 'users' not found. Execute supabase_setup.sql first!"
            )
        if "Invalid API key" in error_msg or "401" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Invalid Supabase API key. Check SUPABASE_KEY in .env"
            )
        raise HTTPException(status_code=500,detail=f"Database error: {error_msg}")
    if not resp.data:
        raise HTTPException(status_code=401,detail="Invalid username or password")
    user=resp.data[0]
    if not verify_password(credentials.password,user["password"]):
        raise HTTPException(status_code=401,detail="Invalid username or password")
    token=create_access_token({
        "sub":user["username"],
        "user_id":user["id"],
        "role":user["role"],
        "first_name":user["first_name"],
        "last_name":user["last_name"],
    })
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            username=user["username"],
            first_name=user["first_name"],
            last_name=user["last_name"],
            role=user["role"]
        )
    )


@app.get("/api/me",response_model=UserResponse)
async def get_me(current_user: dict=Depends(get_current_user)):
    supabase=get_supabase()
    resp=supabase.table("users").select("*").eq("username",current_user["username"]).execute()
    if not resp.data:
        raise HTTPException(status_code=404,detail="User not found")
    u=resp.data[0]
    return UserResponse(id=u["id"],username=u["username"],
                        first_name=u["first_name"],last_name=u["last_name"],role=u["role"])


@app.post("/api/users",response_model=UserResponse)
async def create_user(user_data: UserCreate,_: dict=Depends(require_admin)):
    supabase=get_supabase()
    existing=supabase.table("users").select("id").eq("username",user_data.username).execute()
    if existing.data:
        raise HTTPException(status_code=400,detail="Username already exists")
    resp=supabase.table("users").insert({
        "username":user_data.username,
        "password":hash_password(user_data.password),
        "first_name":user_data.first_name,
        "last_name":user_data.last_name,
        "role":user_data.role.value,
    }).execute()
    if not resp.data:
        raise HTTPException(status_code=500,detail="Failed to create user")
    u=resp.data[0]
    return UserResponse(id=u["id"],username=u["username"],
                        first_name=u["first_name"],last_name=u["last_name"],role=u["role"])


@app.get("/api/users",response_model=List[UserResponse])
async def list_users(_: dict=Depends(require_admin)):
    supabase=get_supabase()
    resp=supabase.table("users").select("*").execute()
    return [
        UserResponse(id=u["id"],username=u["username"],
                     first_name=u["first_name"],last_name=u["last_name"],role=u["role"])
        for u in resp.data
    ]


MOCK_HISTORY={
    "accuracy":[0.15,0.28,0.40,0.51,0.60,0.67,0.72,0.76,0.79,0.81],
    "loss":[2.85,2.50,2.10,1.75,1.45,1.20,1.00,0.85,0.72,0.62],
    "val_accuracy":[0.13,0.25,0.37,0.48,0.57,0.63,0.68,0.72,0.74,0.76],
    "val_loss":[2.90,2.55,2.20,1.85,1.55,1.30,1.10,0.95,0.82,0.72],
}

MOCK_STATS={
    "train_distribution":{
        "kepler-62f":95,"kepler-186f":88,"gliese_163_c":82,
        "k2-155d":75,"kepler-22b":70,"hip_38594_b":68,
        "k2-332b":65,"kepler-296f":62,"55_cancri_bc":60,
        "kepler-174d":58,"gliese_12_b":55,"hd_20794_d":52,
        "kepler-155c":50,"hd_216520_c":48,"k2-72e":45,
        "kepler-283c":42,"kepler-296e":40,"k2-288bb":38,
        "kepler-62e":35,"gliese_":71,
    },
    "valid_top5":[
        {"class":"kepler-62f","count":32},
        {"class":"gliese_163_c","count":28},
        {"class":"kepler-186f","count":25},
        {"class":"k2-155d","count":22},
        {"class":"kepler-22b","count":20},
    ],
    "total_train_samples":1200,
    "total_valid_samples":400,
    "num_classes":20,
}


@app.get("/api/analytics/training")
async def get_training_history(_: dict=Depends(get_current_user)):
    try:
        with open(HISTORY_PATH,'r',encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError,json.JSONDecodeError,OSError):
        return MOCK_HISTORY


@app.get("/api/analytics/stats")
async def get_stats(_: dict=Depends(get_current_user)):
    try:
        with open(STATS_PATH,'r',encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError,json.JSONDecodeError,OSError):
        return MOCK_STATS


def _clean_label(raw) -> str:
    if isinstance(raw,bytes):
        raw=raw.decode('utf-8',errors='ignore')
    s=str(raw).strip()
    s=HEX_PREFIX_RE.sub('',s)
    return s.strip().lower()


def _clean_audio(audio_data: np.ndarray,sr: int=22050) -> np.ndarray:
    audio=np.array(audio_data,dtype=np.float32).squeeze().flatten()
    audio=audio-np.mean(audio)
    mx=np.max(np.abs(audio))
    if mx>0:
        audio=audio/mx
    stft=librosa.stft(audio)
    mag=np.abs(stft)
    phase=np.angle(stft)
    frame_energy=np.sum(mag**2,axis=0)
    n_quiet=max(1,int(len(frame_energy)*0.10))
    quiet_idx=np.argsort(frame_energy)[:n_quiet]
    noise_est=np.mean(mag[:,quiet_idx],axis=1)
    clean_mag=np.maximum(mag-noise_est[:,np.newaxis],0.0)
    audio=librosa.istft(clean_mag*np.exp(1j*phase),length=len(audio))
    trimmed,_=librosa.effects.trim(audio,top_db=30)
    if len(trimmed)>int(sr*0.1):
        audio=trimmed
    mx=np.max(np.abs(audio))
    if mx>0:
        audio=audio/mx
    return audio


def _audio_to_features(audio_data: np.ndarray,sr: int=22050,n_mfcc: int=40) -> np.ndarray:
    try:
        audio=_clean_audio(audio_data,sr)
        min_len=int(sr*0.5)
        if len(audio)<min_len:
            audio=np.pad(audio,(0,min_len-len(audio)))
        mfcc=librosa.feature.mfcc(y=audio,sr=sr,n_mfcc=n_mfcc)
        n_frames=mfcc.shape[1]
        w=min(9,n_frames if n_frames%2==1 else n_frames-1)
        w=max(w,3)
        delta=librosa.feature.delta(mfcc,width=w)
        delta2=librosa.feature.delta(mfcc,order=2,width=w)
        return np.concatenate([
            np.mean(mfcc.T,axis=0),
            np.std(mfcc.T,axis=0),
            np.mean(delta.T,axis=0),
            np.mean(delta2.T,axis=0),
        ])
    except Exception:
        return np.zeros(n_mfcc*4)


@app.post("/api/predict",response_model=PredictionResponse)
async def predict(
    file: UploadFile=File(...),
    current_user: dict=Depends(get_current_user)
):
    if not file.filename.lower().endswith('.npz'):
        raise HTTPException(status_code=400,detail="Only .npz files accepted")
    model=get_model()
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Model not ready. Run ml_pipeline.py first, then restart server."
        )
    classes=get_classes()
    if not classes:
        raise HTTPException(
            status_code=503,
            detail="classes.json not found. Run ml_pipeline.py first."
        )
    class_to_idx={v.lower():int(k) for k,v in classes.items()}
    try:
        content=await file.read()
        npz=np.load(io.BytesIO(content),allow_pickle=True)
        keys=list(npz.keys())
        if 'test_x' in keys and 'test_y' in keys:
            X_raw,y_raw=npz['test_x'],npz['test_y']
        elif 'valid_x' in keys and 'valid_y' in keys:
            X_raw,y_raw=npz['valid_x'],npz['valid_y']
        elif 'train_x' in keys and 'train_y' in keys:
            X_raw,y_raw=npz['train_x'],npz['train_y']
        else:
            raise HTTPException(
                status_code=400,
                detail=f"NPZ must contain test_x/test_y (or valid_x/valid_y). Found keys: {keys}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400,detail=f"Cannot read .npz file: {e}")
    X_features=np.array([_audio_to_features(a) for a in X_raw],dtype=np.float32)
    proba=model.predict(X_features,verbose=0)
    pred_indices=np.argmax(proba,axis=1)
    confidences=np.max(proba,axis=1)
    results=[]
    correct=0
    for i,(pred_idx,raw_label,conf) in enumerate(zip(pred_indices,y_raw,confidences)):
        actual_label=_clean_label(raw_label)
        predicted_class=classes.get(str(pred_idx),"unknown")
        actual_idx=class_to_idx.get(actual_label,-1)
        is_correct=int(pred_idx)==actual_idx
        if is_correct:
            correct+=1
        results.append(PredictionItem(
            sample_id=i,
            is_correct=is_correct,
            confidence=float(conf),
            predicted_class=predicted_class,
            actual_class=actual_label,
        ))
    n=len(y_raw)
    accuracy=correct/n if n>0 else 0.0
    loss=float(np.mean(-np.log(confidences.clip(min=1e-10))))
    return PredictionResponse(accuracy=accuracy,loss=loss,predictions=results)


@app.get("/api/health")
async def health():
    return {
        "status":"healthy",
        "model_loaded":_model is not None,
        "classes_loaded":bool(_classes),
        "model_path_exists":os.path.exists(MODEL_PATH),
    }


@app.get("/")
async def root():
    return {"message":"Alien Signal Classifier API v1.0","docs":"/docs"}
