export interface User {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: 'admin'|'user';
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface TrainingHistory {
  accuracy: number[];
  loss: number[];
  val_accuracy: number[];
  val_loss: number[];
}

export interface ClassCount {
  class: string;
  count: number;
}

export interface Stats {
  train_distribution: Record<string,number>;
  valid_top5: ClassCount[];
  total_train_samples: number;
  total_valid_samples: number;
  num_classes: number;
}

export interface PredictionItem {
  sample_id: number;
  is_correct: boolean;
  confidence: number;
  predicted_class?: string;
  actual_class?: string;
}

export interface PredictionResponse {
  accuracy: number;
  loss: number;
  predictions: PredictionItem[];
}
