export class GatewayService {
  constructor(
    private readonly serviceUrls: {
      examServiceUrl: string;
      authServiceUrl: string;
      aiServiceUrl: string;
      billingServiceUrl: string;
      interviewServiceUrl: string;
      notificationServiceUrl: string;
      userServiceUrl: string;
    }
  ) {}

  buildProxyPlaceholder(path: string) {
    return {
      success: false,
      message: 'No upstream service configured for this path',
      path
    };
  }

  resolveTarget(path: string) {
    if (path.startsWith('/api/exam') || path.startsWith('/api/skills')) {
      return {
        baseUrl: this.serviceUrls.examServiceUrl,
        upstreamPath: path.replace(/^\/api/, '')
      };
    }
    if (path.startsWith('/api/auth')) {
      return {
        baseUrl: this.serviceUrls.authServiceUrl,
        upstreamPath: path.replace(/^\/api/, '')
      };
    }
    if (path.startsWith('/api/ai')) {
      return {
        baseUrl: this.serviceUrls.aiServiceUrl,
        upstreamPath: path.replace(/^\/api/, '')
      };
    }
    if (path.startsWith('/api/billing')) {
      return {
        baseUrl: this.serviceUrls.billingServiceUrl,
        upstreamPath: path.replace(/^\/api/, '')
      };
    }
    if (path.startsWith('/api/interview')) {
      return {
        baseUrl: this.serviceUrls.interviewServiceUrl,
        upstreamPath: path.replace(/^\/api/, '')
      };
    }
    if (path.startsWith('/api/notification')) {
      return {
        baseUrl: this.serviceUrls.notificationServiceUrl,
        upstreamPath: path.replace(/^\/api/, '')
      };
    }
    if (path.startsWith('/api/user')) {
      return {
        baseUrl: this.serviceUrls.userServiceUrl,
        upstreamPath: path.replace(/^\/api/, '')
      };
    }
    return null;
  }
}
