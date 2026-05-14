import { paintPicker, type PaintRequest, type PaintResponse } from "./paint";

self.onmessage = (event: MessageEvent<PaintRequest>) => {
  const response = paintPicker(event.data);
  const worker = self as unknown as {
    postMessage(message: PaintResponse, transfer: Transferable[]): void;
  };
  worker.postMessage(response, [response.pixels]);
};
