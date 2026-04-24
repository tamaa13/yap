"use client";

import { useEffect, useState } from "react";

export interface TypewriterProps {
  text: string;
  speed?: number;
  onDone?: () => void;
  caret?: boolean;
}

export function Typewriter({ text, speed = 18, onDone, caret = true }: TypewriterProps) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setShown("");
    setDone(false);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i++;
      if (i > text.length) {
        setDone(true);
        onDone?.();
        return;
      }
      setShown(text.slice(0, i));
      timer = setTimeout(tick, speed + Math.random() * 20);
    };
    timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [text, speed, onDone]);

  return <span className={!done && caret ? "al-caret" : ""}>{shown}</span>;
}
