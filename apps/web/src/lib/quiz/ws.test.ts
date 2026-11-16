import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAssessmentWsUrl } from './ws';

describe('getAssessmentWsUrl', () => {
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
    expect(getAssessmentWsUrl('quiz-123')).toBe('wss://custom-ws.example.com/api/v1/assessments/quiz-123/ws');
  });

  it('converts NEXT_PUBLIC_API_URL to websocket protocol', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/api/v1';
    expect(getAssessmentWsUrl('quiz-456')).toBe('wss://api.example.com/api/v1/assessments/quiz-456/ws');

    process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000';
    expect(getAssessmentWsUrl('quiz-456')).toBe('ws://127.0.0.1:8000/api/v1/assessments/quiz-456/ws');
  });

  it('routes localhost and LAN IP to port 8000', () => {
    global.window = {
      location: {
        hostname: 'localhost',
        protocol: 'http:',
      },
    } as any;
    expect(getAssessmentWsUrl('quiz-789')).toBe('ws://localhost:8000/api/v1/assessments/quiz-789/ws');

    global.window = {
      location: {
        hostname: '192.168.1.50',
        protocol: 'http:',
      },
    } as any;
    expect(getAssessmentWsUrl('quiz-789')).toBe('ws://192.168.1.50:8000/api/v1/assessments/quiz-789/ws');
  });

  it('defaults production domains to Render FastAPI backend', () => {
    global.window = {
      location: {
        hostname: 'cnc-lms.vercel.app',
        protocol: 'https:',
      },
    } as any;
    expect(getAssessmentWsUrl('quiz-prod')).toBe('wss://cnc-backend-qzmb.onrender.com/api/v1/assessments/quiz-prod/ws');
  });
});
