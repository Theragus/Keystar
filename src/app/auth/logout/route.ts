import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, deleteSessionToken } from "@/core/auth/session";
import { env } from "@/core/env";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionToken(token);
  const res = NextResponse.redirect(new URL("/login", env().APP_URL), { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
