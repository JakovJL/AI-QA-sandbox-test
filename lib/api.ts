import { httpRequest, HttpResult } from "./http";
import { loadTargetEnv, TargetEnv } from "./env";

export class ApiClient {
  readonly env: TargetEnv;

  constructor(env: TargetEnv = loadTargetEnv()) {
    this.env = env;
  }

  private pin(): { hostname: string; ip: string } | undefined {
    return this.env.targetIp ? { hostname: this.env.targetHost, ip: this.env.targetIp } : undefined;
  }

  private url(path: string): string {
    return `https://${this.env.targetHost}${path}`;
  }

  store(path: string, headers: Record<string, string> = {}): Promise<HttpResult> {
    return httpRequest(this.url(path), {
      headers: { "x-publishable-api-key": this.env.publishableKey, ...headers },
      pinHost: this.pin(),
    });
  }

  storeRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResult> {
    return httpRequest(this.url(path), {
      method,
      headers: {
        "x-publishable-api-key": this.env.publishableKey,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      pinHost: this.pin(),
    });
  }

  async adminToken(): Promise<string> {
    const response = await httpRequest(this.url("/auth/user/emailpass"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.env.adminEmail, password: this.env.adminPassword }),
      pinHost: this.pin(),
    });
    if (response.status !== 200) {
      throw new Error(`Admin auth failed with status ${response.status}: ${response.body}`);
    }
    const parsed = JSON.parse(response.body) as { token?: string };
    if (!parsed.token) throw new Error("Admin auth response has no token");
    return parsed.token;
  }

  admin(path: string, token: string, headers: Record<string, string> = {}): Promise<HttpResult> {
    return httpRequest(this.url(`/admin${path}`), {
      headers: { authorization: `Bearer ${token}`, ...headers },
      pinHost: this.pin(),
    });
  }

  adminRequest(method: string, path: string, token: string, body?: unknown): Promise<HttpResult> {
    return httpRequest(this.url(`/admin${path}`), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      pinHost: this.pin(),
    });
  }
}

export function parseJson<T = unknown>(result: HttpResult): T {
  return JSON.parse(result.body) as T;
}
