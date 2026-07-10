import { defineEventHandler } from "h3";
import { userStore } from "../../utils/gateway/auth/users";

export default defineEventHandler((event) => {
  userStore.deleteToken(event.context.auth!.token);
  return { ok: true };
});
