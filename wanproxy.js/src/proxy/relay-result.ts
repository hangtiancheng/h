export interface RelayResult {
  readonly closed: Promise<void>;
  readonly stop: () => void;
}
