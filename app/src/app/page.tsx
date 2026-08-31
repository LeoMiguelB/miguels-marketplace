import { loadCatalog, fetchPublishedTrackRows } from "@/lib/catalog";
import { sql } from "@/lib/db";
import { Store } from "./store";

export default async function Home() {
  const catalog = await loadCatalog(() => fetchPublishedTrackRows(sql));
  return <Store catalog={catalog} />;
}
