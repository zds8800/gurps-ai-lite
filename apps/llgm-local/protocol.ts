/** Minimal Ollama wire types and localhost-only client. No SDK dependency. */

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: unknown;
  };
}

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatClient {
  chat(
    messages: readonly OllamaMessage[],
    tools: readonly ToolDefinition[],
  ): Promise<OllamaMessage>;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Native Ollama chat, constrained to this machine rather than a remote provider. */
export class OllamaClient implements ChatClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: FetchLike;

  constructor(
    model: string,
    baseUrl = "http://localhost:11434",
    fetchImpl: FetchLike = fetch,
  ) {
    this.model = model;
    this.fetchImpl = fetchImpl;
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
      throw new Error("OllamaClient only permits a local http endpoint (localhost, 127.0.0.1, or ::1).");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async chat(
    messages: readonly OllamaMessage[],
    tools: readonly ToolDefinition[],
  ): Promise<OllamaMessage> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools,
        think: false,
        stream: false,
        options: { temperature: 0.2, num_predict: 1000 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Ollama returned HTTP ${response.status}: ${detail}`);
    }
    const data = await response.json() as { message?: OllamaMessage };
    if (!data.message || typeof data.message.content !== "string") {
      throw new Error("Ollama returned no assistant message.");
    }
    return data.message;
  }
}
