import { Mutex } from "async-mutex";
import type { H3Event } from "h3";
import { defineGatewayEventHandler } from "./errors";

const userConfigLocks = new Map<number, Mutex>();

// Config routes mutate both the user-scoped runtime graph and SQLite; keep that pair atomic.
export function defineGatewayConfigMutationHandler<T>(handler: (event: H3Event) => Promise<T> | T) {
  return defineGatewayEventHandler((event) => {
    const userId = event.context.auth!.user.id;
    return userConfigLock(userId).runExclusive(() => handler(event));
  });
}

function userConfigLock(userId: number) {
  const existing = userConfigLocks.get(userId);
  if (existing) {
    return existing;
  }
  const lock = new Mutex();
  userConfigLocks.set(userId, lock);
  return lock;
}
