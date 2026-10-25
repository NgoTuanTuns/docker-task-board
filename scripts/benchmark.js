import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const failedChecks = new Counter('health_check_failures');
const responseTime = new Trend('health_response_time', true);
const baseUrl = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

export const options = {
  scenarios: {
    health_load: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/health`, { tags: { endpoint: 'health' } });
  responseTime.add(response.timings.duration);
  const ok = check(response, {
    'status is 200': (r) => r.status === 200,
    'database is up': (r) => r.json('db') === 'up',
    'redis is up': (r) => r.json('redis') === 'up',
    'host is present': (r) => Boolean(r.json('host')),
  });
  if (!ok) failedChecks.add(1);
  sleep(0.1);
}
