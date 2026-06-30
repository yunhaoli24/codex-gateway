import { requireAuthenticatedUser } from "../../utils/gateway/auth/context";

export default defineEventHandler((event) => {
  return { user: requireAuthenticatedUser(event) };
});
