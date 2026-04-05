import { PatchMeInput } from '../schemas/user.schema';

export class UserService {
  getMe() {
    return {
      id: 'user-placeholder-001',
      email: 'demo@thinkai.dev',
      displayName: 'Think AI User',
      bio: 'Day 2 modular service response'
    };
  }

  updateMe(input: PatchMeInput) {
    return {
      message: 'Profile update accepted',
      profile: {
        ...this.getMe(),
        ...input
      }
    };
  }
}
