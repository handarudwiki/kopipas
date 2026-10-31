import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@/generated/prisma/enums";

/** The authenticated actor for the current request. Every service call is scoped by orgId (N5). */
export type Ctx = {
  userId: string;
  orgId: string;
  role: Role;
  name: string;
  email: string;
};

/** Minimal actor info used by the audit-log extension. */
export type ActorStore = { orgId: string | null; actorId: string | null };

export const actorStorage = new AsyncLocalStorage<ActorStore>();

export function runAsActor<T>(actor: ActorStore, fn: () => Promise<T>): Promise<T> {
  return actorStorage.run(actor, fn);
}

export function currentActor(): ActorStore | undefined {
  return actorStorage.getStore();
}
