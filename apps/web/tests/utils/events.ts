import {
  encodeAbiParameters,
  encodeEventTopics,
  type Abi,
  type AbiEvent,
} from "viem";

/**
 * Encode a single event log to the eth_getLogs return shape (topics + data).
 * `args` must be the named-field object the event abi declares; viem's
 * `encodeEventTopics` handles topic ordering, and `encodeAbiParameters`
 * encodes the non-indexed inputs into `data` in declaration order.
 */
export function encodeEventLog<TAbi extends Abi>({
  abi,
  eventName,
  args,
}: {
  abi: TAbi;
  eventName: string;
  args: Record<string, unknown>;
}): { topics: `0x${string}`[]; data: `0x${string}` } {
  const event = abi.find(
    (x): x is AbiEvent => x.type === "event" && x.name === eventName,
  );
  if (!event) throw new Error(`encodeEventLog: ${eventName} not in ABI`);

  // Build indexed-args record viem expects on the `args` field.
  const indexedArgs: Record<string, unknown> = {};
  for (const input of event.inputs) {
    if (input.indexed && input.name && input.name in args) {
      indexedArgs[input.name] = args[input.name];
    }
  }
  const topics = encodeEventTopics({
    abi: [event],
    eventName,
    args: indexedArgs,
  }) as `0x${string}`[];

  const nonIndexed = event.inputs.filter((i) => !i.indexed);
  const values = nonIndexed.map((i) => args[i.name as string]);
  const data = encodeAbiParameters(nonIndexed, values) as `0x${string}`;

  return { topics, data };
}
