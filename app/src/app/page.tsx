import { loadCatalog, fetchPublishedTrackRows } from "@/lib/catalog";
import { signMediaUrl } from "@/lib/s3";
import { sql } from "@/lib/db";
import { Store } from "./store";

export default async function Home() {
  const catalog = await loadCatalog(
    () => fetchPublishedTrackRows(sql),
    signMediaUrl,
  );
  return <Store catalog={catalog} />;
}
