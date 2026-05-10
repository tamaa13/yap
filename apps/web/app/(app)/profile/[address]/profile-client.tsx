"use client";

import { useFighters } from "@/hooks/use-fighters";
import { useWallet } from "@/hooks/use-wallet";
import { Profile } from "./profile";

export function ProfileClient({ address }: { address: string }) {
  const { addr } = useWallet();
  const isSelf = !!addr && addr.toLowerCase() === address.toLowerCase();
  const { data: owned, isLoading } = useFighters({
    owner: address as `0x${string}`,
  });
  return (
    <Profile
      address={address}
      isSelf={isSelf}
      ownedFighters={owned}
      isLoading={isLoading}
    />
  );
}
