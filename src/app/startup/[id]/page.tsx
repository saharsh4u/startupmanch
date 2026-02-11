import StartupProfileClient from "@/components/startup/StartupProfileClient";

export default function StartupProfilePage({ params }: { params: { id: string } }) {
  return <StartupProfileClient startupId={params.id} />;
}
