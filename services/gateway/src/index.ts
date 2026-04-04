import { commonServiceEnvSchema, loadEnv } from '@thinkai/config';
import { buildGatewayApp } from './app';

const env = loadEnv(commonServiceEnvSchema);
const app = buildGatewayApp();

const start = async () => {
  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
