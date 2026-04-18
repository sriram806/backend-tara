import { isDatabaseConfigured } from '@thinkai/db';
import { redisClient } from '../queues/connection';

export class UserHealthController {

  // ✅ JSON endpoint
  async health() {
    const uptime = process.uptime();

    return {
      status: "ok",
      service: "user-service",
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime)} sec`,
      environment: process.env.NODE_ENV || "development"
    };
  }

  async ready() {
    const databaseConfigured = isDatabaseConfigured();

    let cacheReady = false;
    try {
      cacheReady = (await redisClient.ping()) === 'PONG';
    } catch {
      cacheReady = false;
    }

    return {
      status: databaseConfigured && cacheReady ? 'ok' : 'degraded',
      service: 'user-service',
      timestamp: new Date().toISOString(),
      dependencies: {
        databaseConfigured,
        cacheReady
      }
    };
  }

  // ✅ HTML Dashboard
  async healthUI() {
    const now = new Date().toISOString();
    const uptime = process.uptime();

    const minutes = Math.floor(uptime / 60);
    const seconds = Math.floor(uptime % 60);

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>User Service Health</title>

      <!-- Auto refresh -->
      <meta http-equiv="refresh" content="10">

      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Inter', sans-serif;
        }

        body {
          background: #0f172a;
          color: #e2e8f0;
          padding: 40px;
        }

        .container {
          max-width: 900px;
          margin: auto;
        }

        h1 {
          font-size: 28px;
          margin-bottom: 10px;
        }

        .subtitle {
          color: #94a3b8;
          margin-bottom: 30px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }

        .card {
          background: #1e293b;
          padding: 20px;
          border-radius: 16px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }

        .title {
          font-size: 14px;
          color: #94a3b8;
          margin-bottom: 10px;
        }

        .value {
          font-size: 22px;
          font-weight: bold;
        }

        .status-ok {
          color: #22c55e;
        }

        .badge {
          display: inline-block;
          margin-top: 10px;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 12px;
          background: #22c55e20;
          color: #22c55e;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }

        .refresh {
          background: #2563eb;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          color: white;
          cursor: pointer;
        }

        .footer {
          margin-top: 30px;
          font-size: 13px;
          color: #64748b;
          text-align: center;
        }

        .pulse {
          width: 10px;
          height: 10px;
          background: #22c55e;
          border-radius: 50%;
          display: inline-block;
          margin-right: 6px;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.6); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }
      </style>
    </head>

    <body>

      <div class="container">
        <div class="header">
          <div>
            <h1>🚀 User Service Health</h1>
            <div class="subtitle">Fastify Monitoring Dashboard</div>
          </div>
          <button class="refresh" onclick="location.reload()">Refresh</button>
        </div>

        <div class="grid">

          <div class="card">
            <div class="title">Service Status</div>
            <div class="value status-ok">
              <span class="pulse"></span> RUNNING
            </div>
            <div class="badge">Healthy</div>
          </div>

          <div class="card">
            <div class="title">Timestamp</div>
            <div class="value">${now}</div>
          </div>

          <div class="card">
            <div class="title">Environment</div>
            <div class="value">${process.env.NODE_ENV || "development"}</div>
          </div>

          <div class="card">
            <div class="title">Uptime</div>
            <div class="value">${minutes}m ${seconds}s</div>
          </div>

        </div>

        <div class="footer">
          © User Service • Fastify Health System
        </div>
      </div>

    </body>
    </html>
    `;
  }
}