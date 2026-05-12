import type { ReactElement, ReactNode } from "react";
import { render, renderHook, type RenderOptions } from "@testing-library/react";
import { WagmiProvider, type Config } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTestWagmiConfig } from "./wagmi";

interface ProviderOptions {
  wagmi?: Config;
}

function makeWrapper({ wagmi }: ProviderOptions) {
  const config = wagmi ?? createTestWagmiConfig();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    );
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {},
) {
  const { wagmi, ...rest } = options;
  return render(ui, { wrapper: makeWrapper({ wagmi }), ...rest });
}

export function renderHookWithProviders<TResult, TProps>(
  hook: (props: TProps) => TResult,
  options: ProviderOptions & { initialProps?: TProps } = {},
) {
  const { wagmi, initialProps } = options;
  return renderHook(hook, { wrapper: makeWrapper({ wagmi }), initialProps });
}

export * from "@testing-library/react";
