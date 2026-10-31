import { notFound } from "next/navigation";
import { ApiError } from "@/lib/errors";

/** In Server Components: turn a service-level 404 into Next's not-found page. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
