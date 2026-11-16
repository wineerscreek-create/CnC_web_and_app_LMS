import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMessagingWsUrl } from './ws';

describe('getMessagingWsUrl', () => {
  const originalEnv = { ...process.env };
  const originalWindow = global.window;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_WS_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.window = originalWindow;
  });

  it('uses NEXT_PUBLIC_WS_URL when defined', () => {
    process.env.NEXT_PUBLIC_WS_URL = 'wss://custom-ws.example.com';
    expect(getMessagingWsUrl()).toBe('wss://custom-ws.example.com/api/v1/messaging/ws');
  });

  it('converts NEXT_PUBLIC_API_URL to websocket protocol', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/api/v1';
    expect(getMessagingWsUrl()).toBe('wss://api.example.com/api/v1/messaging/ws');

    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000';
    expect(getMessagingWsUrl()).toBe('ws://127.0.0.1:8000/api/v1/messaging/ws');
  });

  it('routes localhost and local IP to port 8000', () => {
    global.window = {
      location: {
        hostname: 'localhost',
        protocol: 'http:',
      },
    } as any;
    expect(getMessagingWsUrl()).toBe('ws://localhost:8000/api/v1/messaging/ws');

    global.window = {
      location: {
        hostname: '192.168.1.100',
        protocol: 'http:',
      },
    } as any;
    expect(getMessagingWsUrl()).toBe('ws://192.168.1.100:8000/api/v1/messaging/ws');
  });

  it('defaults production domains to Render FastAPI backend', () => {
    global.window = {
      location: {
        hostname: 'cnc-lms.vercel.app',
        protocol: 'https:',
      },
    } as any;
    expect(getMessagingWsUrl()).toBe('wss://cnc-backend-qzmb.onrender.com/api/v1/messaging/ws');
  });
});
