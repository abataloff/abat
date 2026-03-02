import type { IncomingMessage, ServerResponse } from 'node:http';
import https from 'node:https';
import jwt from 'jsonwebtoken';
import { upsertGoogleUser, getUserById, DbUser } from './db';
import { addRoute, sendJson, redirect } from './router';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8051';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const [key, ...vals] = pair.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(vals.join('='));
  }
  return cookies;
}

export function getUserFromRequest(req: IncomingMessage): DbUser | null {
  const cookies = parseCookies(req);
  const token = cookies['token'];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const user = getUserById(payload.userId);
    return user ?? null;
  } catch {
    return null;
  }
}

function setAuthCookie(res: ServerResponse, userId: number): void {
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
  res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`);
}

function clearAuthCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpsPost(url: string, body: string, contentType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export function registerAuthRoutes(): void {
  // Redirect to Google consent page
  addRoute('GET', '/auth/google', (_req, res) => {
    const redirectUri = `${BASE_URL}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });
    redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // Handle Google callback
  addRoute('GET', '/auth/google/callback', async (req, res) => {
    try {
      const url = new URL(req.url!, BASE_URL);
      const code = url.searchParams.get('code');
      if (!code) {
        redirect(res, '/?auth=error');
        return;
      }

      // Exchange code for tokens
      const redirectUri = `${BASE_URL}/auth/google/callback`;
      const tokenBody = new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString();

      const tokenData = JSON.parse(
        await httpsPost('https://oauth2.googleapis.com/token', tokenBody, 'application/x-www-form-urlencoded'),
      );

      if (!tokenData.access_token) {
        redirect(res, '/?auth=error');
        return;
      }

      // Get user info
      const userInfo = JSON.parse(
        await httpsGet(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`),
      );

      const user = upsertGoogleUser(
        userInfo.id,
        userInfo.email,
        userInfo.name,
        userInfo.picture || null,
        ADMIN_EMAILS,
      );

      setAuthCookie(res, user.id);
      redirect(res, '/');
    } catch (err) {
      console.error('OAuth error:', err);
      redirect(res, '/?auth=error');
    }
  });

  // Current user
  addRoute('GET', '/api/me', (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) {
      sendJson(res, { user: null });
      return;
    }
    sendJson(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url,
        isAdmin: !!user.is_admin,
      },
    });
  });

  // Logout
  addRoute('POST', '/api/logout', (_req, res) => {
    clearAuthCookie(res);
    sendJson(res, { ok: true });
  });
}
