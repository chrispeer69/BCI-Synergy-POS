import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./auth";
import { ProviderError } from "./providers/types";

/** Wrap route handlers with consistent JSON errors. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      // Let Next.js control-flow signals (dynamic usage, redirect, notFound) propagate untouched.
      if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string") throw e;
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", details: e.flatten() }, { status: 400 });
      if (e instanceof ProviderError) {
        console.error("[provider]", e.message, e.status, e.body);
        return NextResponse.json({ error: "Payment provider error" }, { status: 502 });
      }
      console.error(e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
