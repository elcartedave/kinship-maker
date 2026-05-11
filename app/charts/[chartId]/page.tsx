import { ChartEditorPage } from "@/components/editor/chart-editor-page";

export default async function Page({
  params,
}: {
  params: Promise<{ chartId: string }>;
}) {
  const { chartId } = await params;

  return <ChartEditorPage chartId={chartId} />;
}
