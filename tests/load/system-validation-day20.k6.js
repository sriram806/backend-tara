import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    auth_smoke: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '60s', target: 50 },
        { duration: '30s', target: 0 }
      ],
      exec: 'authFlow'
    },
    non_ai_health: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
      exec: 'healthFlow'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<200', 'p(99)<500']
  }
};

const AUTH_URL = __ENV.AUTH_URL || 'http://localhost:4001';
const USER_URL = __ENV.USER_URL || 'http://localhost:4002';
const BILLING_URL = __ENV.BILLING_URL || 'http://localhost:4010';
const NOTIFY_URL = __ENV.NOTIFY_URL || 'http://localhost:4012';
const INTERVIEW_URL = __ENV.INTERVIEW_URL || 'http://localhost:4013';
const AI_URL = __ENV.AI_URL || 'http://localhost:8000';

export function authFlow() {
  const payload = JSON.stringify({
    email: `perf-${__VU}-${__ITER}@example.com`,
    password: 'Pass@123456',
    fullName: 'Perf User',
    targetRole: 'Backend Engineer'
  });

  const headers = { 'Content-Type': 'application/json' };
  const registerRes = http.post(`${AUTH_URL}/auth/register`, payload, { headers });

  check(registerRes, {
    'register status 201|409': (r) => r.status === 201 || r.status === 409
  });

  sleep(0.5);
}

export function healthFlow() {
  const responses = [
    http.get(`${AUTH_URL}/health`),
    http.get(`${USER_URL}/health`),
    http.get(`${USER_URL}/health/ready`),
    http.get(`${BILLING_URL}/health`),
    http.get(`${NOTIFY_URL}/health`),
    http.get(`${INTERVIEW_URL}/health`),
    http.get(`${AI_URL}/health`),
    http.get(`${AI_URL}/ready`)
  ];

  check(responses[0], { 'auth health 200': (r) => r.status === 200 });
  check(responses[1], { 'user health 200': (r) => r.status === 200 });
  check(responses[2], { 'user ready 200|503': (r) => r.status === 200 || r.status === 503 });
  check(responses[3], { 'billing health 200': (r) => r.status === 200 });
  check(responses[4], { 'notification health 200': (r) => r.status === 200 });
  check(responses[5], { 'interview health 200': (r) => r.status === 200 });
  check(responses[6], { 'ai health 200': (r) => r.status === 200 });
  check(responses[7], { 'ai ready 200|503': (r) => r.status === 200 || r.status === 503 });

  sleep(1);
}
