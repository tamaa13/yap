import { ProfileClient } from "./profile-client";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <ProfileClient address={address} />;
}
