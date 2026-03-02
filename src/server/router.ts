import type { IncomingMessage, ServerResponse } from 'node:http';

export type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => void | Promise<void>;

interface Route {
  method: string;
  parts: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];

export function addRoute(method: string, path: string, handler: RouteHandler): void {
  routes.push({ method, parts: path.split('/').filter(Boolean), handler });
}

export function matchRoute(method: string, url: string): { handler: RouteHandler; params: Record<string, string> } | null {
  const [pathname] = url.split('?');
  const urlParts = pathname.split('/').filter(Boolean);

  for (const route of routes) {
    if (route.method !== method) continue;
    if (route.parts.length !== urlParts.length) continue;

    const params: Record<string, string> = {};
    let match = true;

    for (let i = 0; i < route.parts.length; i++) {
      if (route.parts[i].startsWith(':')) {
        params[route.parts[i].slice(1)] = urlParts[i];
      } else if (route.parts[i] !== urlParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { handler: route.handler, params };
  }

  return null;
}

export function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export function redirect(res: ServerResponse, url: string): void {
  res.writeHead(302, { Location: url });
  res.end();
}
