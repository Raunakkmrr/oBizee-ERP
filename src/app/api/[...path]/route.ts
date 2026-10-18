import { tenantProxy } from "@/lib/server/tenant-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = tenantProxy;
export const POST = tenantProxy;
