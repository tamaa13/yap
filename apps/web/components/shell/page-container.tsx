import type { CSSProperties, ReactNode } from "react";

export interface PageContainerProps {
  children: ReactNode;
  maxWidth?: number;
  padding?: number;
  style?: CSSProperties;
}

export function PageContainer({
  children,
  maxWidth = 1280,
  padding = 24,
  style,
}: PageContainerProps) {
  return (
    <div className="al-page" style={{ maxWidth, margin: "0 auto", padding, ...style }}>
      {children}
    </div>
  );
}
