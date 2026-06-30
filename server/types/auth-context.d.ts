import type { AuthenticatedUser } from "../utils/gateway/auth/users";

declare module "h3" {
  interface H3EventContext {
    auth?: {
      user: AuthenticatedUser;
      token: string;
    };
  }
}
