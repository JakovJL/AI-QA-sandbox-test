import https from "node:https";
import { URL } from "node:url";

export interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  durationMs: number;
}

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  pinHost?: { hostname: string; ip: string };
}

export function httpRequest(url: string, options: HttpOptions = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const startedAt = performance.now();

    const pin = options.pinHost;
    const agent = pin
      ? new https.Agent({
          lookup: (
            hostname: string,
            _lookupOptions: unknown,
            callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
          ) => {
            if (hostname === pin.hostname) {
              callback(null, pin.ip, 4);
            } else {
              callback(new Error(`Unexpected host ${hostname}`), "", 0);
            }
          },
        })
      : undefined;

    const request = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: options.method ?? "GET",
        headers: options.headers,
        agent,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            durationMs: Math.round(performance.now() - startedAt),
          });
        });
      },
    );

    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}
