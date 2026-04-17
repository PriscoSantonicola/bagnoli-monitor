import { ScadenzeView } from "@/components/ScadenzeView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Page() {
  return <ScadenzeView tipo="STOP" />;
}
