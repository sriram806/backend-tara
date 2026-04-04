export type ServiceHealthResponse = {
  status: 'ok';
  service: string;
};

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
};
