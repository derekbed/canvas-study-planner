import { requireChatGPTUser } from "@/app/chatgpt-auth";
import PairClient from "./pair-client";
export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = (await searchParams).code || "";
  await requireChatGPTUser(`/extension/pair?code=${encodeURIComponent(code)}`);
  return <PairClient code={code} />;
}
