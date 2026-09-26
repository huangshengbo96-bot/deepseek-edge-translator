import { browser } from 'wxt/browser';
import type { BackgroundRequest, ResponseEnvelope } from './types';

type RequestOfType<T extends BackgroundRequest['type']> = Extract<BackgroundRequest, { type: T }>;

export function makeRequest<T extends BackgroundRequest['type']>(
  type: T,
  payload: RequestOfType<T>['payload']
): RequestOfType<T> {
  return { type, payload, requestId: crypto.randomUUID() } as RequestOfType<T>;
}

export async function sendRequest<T>(request: BackgroundRequest): Promise<T> {
  const response = await browser.runtime.sendMessage(request) as ResponseEnvelope<T>;
  if (!response?.ok) {
    throw Object.assign(new Error(response?.error.message ?? '扩展后台没有响应'), {
      appError: response?.error
    });
  }
  return response.data;
}
