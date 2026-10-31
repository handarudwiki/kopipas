import type { Metadata } from "next";
import { getCtxWith } from "@/lib/auth/current";
import { fmtDateTime } from "@/lib/format";
import { DATASET_KINDS, listDatasets } from "@/server/risk";
import { Empty, PageHeader, Pill, Table, TableCard } from "@/components/ui";
import { ActivateDatasetButton, UploadDatasetButton } from "./datasets-client";

export const metadata: Metadata = { title: "Dataset Referensi" };

export default async function DatasetsPage() {
  await getCtxWith("dataset:manage");
  const items = await listDatasets();
  return (
    <>
      <PageHeader
        title="Dataset Referensi"
        subtitle="Peta tutupan hutan 31 Des 2020 dan batas kawasan hutan untuk area pilot. Versi aktif dicatat di setiap cek risiko (N7)."
        actions={<UploadDatasetButton />}
      />
      <TableCard>
        {items.length === 0 ? (
          <Empty title="Belum ada dataset" hint="Unggah GeoJSON FeatureCollection poligon hutan (mis. hasil vektorisasi JRC GFC2020 untuk area pilot)." />
        ) : (
          <Table head={["Jenis", "Nama", "Versi", "Poligon", "Sumber", "Dimuat", "Status", ""]}>
            {items.map((d) => (
              <tr key={d.id} className="table-row">
                <td className="font-semibold">{DATASET_KINDS[d.kind as keyof typeof DATASET_KINDS] ?? d.kind}</td>
                <td className="text-fg-2">{d.name}</td>
                <td className="font-mono text-xs">{d.version}</td>
                <td>{d.featureCount}</td>
                <td className="max-w-[220px] truncate text-xs text-fg-2">{d.source ?? "—"}</td>
                <td className="whitespace-nowrap text-xs text-fg-2">{fmtDateTime(d.createdAt)}</td>
                <td>{d.isActive ? <Pill tone="ok">Aktif</Pill> : <Pill tone="neutral">Arsip</Pill>}</td>
                <td className="text-right">{!d.isActive && <ActivateDatasetButton id={d.id} />}</td>
              </tr>
            ))}
          </Table>
        )}
      </TableCard>
    </>
  );
}
