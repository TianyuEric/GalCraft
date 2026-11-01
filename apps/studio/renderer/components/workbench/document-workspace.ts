/** A mounted business editor owns its draft; the shell owns document identity and close guards. */
export type DocumentWorkspace = {
  open(id: string, title: string, mount: (done: () => void, changed: () => void) => {
    node: HTMLElement;
    dirty(): boolean;
    activate?(active: boolean): void;
    dispose(): void;
  }): () => void;
};
