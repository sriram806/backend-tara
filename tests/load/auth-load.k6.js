import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<200']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4001';

export default function () {
  const payload = JSON.stringify({
    email: `load-${__VU}-${__ITER}@example.com`,
    password: 'Pass@123456',
    fullName: 'Load Test User',
    targetRole: 'Backend Engineer'
  });

  const headers = { 'Content-Type': 'application/json' };
  const res = http.post(`${BASE_URL}/auth/register`, payload, { headers });

  check(res, {
    'status is 201 or 409': (r) => r.status === 201 || r.status === 409,
    'response time under 200ms for p95 target tracking': (r) => r.timings.duration < 1000
  });

  sleep(1);
}
