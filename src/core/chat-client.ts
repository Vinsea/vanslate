import type { ChatRequest, ChatResponse } from "./types";
import { normalizeUsage, readableError } from "./utils";

export interface ChatClient {
  complete(request: ChatRequest): Promise<ChatResponse>;
}

export type Sleep = (ms: number) => Promise<void>;

export class OpenAICompatibleChatClient implements ChatClient {
  constructor(
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly sleepImpl: Sleep = sleep,
    private readonly retryBaseDelayMs = 1000
  ) {}

  async complete(request: ChatRequest): Promise<ChatResponse> {
    const payload = await this.fetchJsonWithRetry(request.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${request.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        temperature: request.temperature,
        messages: request.messages
      })
    }, request.retryCount);

    const message = (payload as any)?.choices?.[0]?.message || {};
    return {
      message,
      content: String(message.content || "").trim(),
      usage: normalizeUsage((payload as any)?.usage),
      raw: payload
    };
  }

  private async fetchJsonWithRetry(endpoint: string, request: RequestInit, retryCount: number): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const response = await this.fetchImpl(endpoint, request);
        const payload = await response.json().catch(() => null);
        if (response.ok) return payload;

        const message = (payload as any)?.error?.message || `${response.status} ${response.statusText}`;
        const error = new Error(`API request failed: ${message}`) as Error & { status?: number; retryAfter?: number };
        error.status = response.status;
        error.retryAfter = Number(response.headers.get("retry-after")) || 0;
        throw error;
      } catch (error) {
        lastError = error;
        if (attempt >= retryCount || !this.shouldRetry(error)) break;
        await this.sleepImpl(this.retryDelay(error, attempt));
      }
    }
    throw lastError;
  }

  private shouldRetry(error: unknown): boolean {
    const record = error as Record<string, unknown>;
    if (record?.status === 429) return true;
    if (Number(record?.status) >= 500) return true;
    return /timeout|network|failed to fetch/i.test(readableError(error));
  }

  private retryDelay(error: unknown, attempt: number): number {
    const retryAfter = Number((error as Record<string, unknown>)?.retryAfter) || 0;
    if (retryAfter > 0) return Math.min(retryAfter * 1000, 15000);
    return Math.min(this.retryBaseDelayMs * 2 ** attempt, 8000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
