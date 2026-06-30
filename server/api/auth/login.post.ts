import { createError, readValidatedBody } from "h3";
import { z } from "zod";
import { userStore } from "../../utils/gateway/auth/users";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, (body) => loginSchema.parse(body));
  const session = await userStore.login(input.username, input.password);
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "Invalid username or password",
    });
  }
  return session;
});
