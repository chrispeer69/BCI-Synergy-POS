import { NextResponse } from "next/server";
import { handler } from "@/lib/http";
import { destroySession } from "@/lib/session";

export const POST = handler(async (req: Request) => {
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
});
