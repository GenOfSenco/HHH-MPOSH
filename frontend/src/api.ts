import axios from 'axios';
import type { LoginResponse,TrainingHistory,Stats,PredictionResponse,User } from './types';

const API_BASE='/api';

const api=axios.create({
  baseURL:API_BASE,
});

api.interceptors.request.use((config)=>{
  const token=localStorage.getItem('token');
  if(token){
    config.headers.Authorization=`Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response)=>response,
  (error)=>{
    if(error.response?.status===401){
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href='/login';
    }
    return Promise.reject(error);
  }
);

export const authApi={
  login: async(username: string,password: string): Promise<LoginResponse>=>{
    const response=await api.post<LoginResponse>('/login',{username,password});
    return response.data;
  },
  getMe: async(): Promise<User>=>{
    const response=await api.get<User>('/me');
    return response.data;
  },
};

export const usersApi={
  create: async(data: {
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    role: 'admin'|'user';
  }): Promise<User>=>{
    const response=await api.post<User>('/users',data);
    return response.data;
  },
  list: async(): Promise<User[]>=>{
    const response=await api.get<User[]>('/users');
    return response.data;
  },
};

export const analyticsApi={
  getTrainingHistory: async(): Promise<TrainingHistory>=>{
    const response=await api.get<TrainingHistory>('/analytics/training');
    return response.data;
  },
  getStats: async(): Promise<Stats>=>{
    const response=await api.get<Stats>('/analytics/stats');
    return response.data;
  },
};

export const predictionApi={
  predict: async(file: File): Promise<PredictionResponse>=>{
    const formData=new FormData();
    formData.append('file',file);
    const response=await api.post<PredictionResponse>('/predict',formData,{
      headers:{
        'Content-Type':'multipart/form-data',
      },
    });
    return response.data;
  },
};

export default api;
