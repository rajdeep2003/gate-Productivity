export async function withMutation<T>(work: () => Promise<T>): Promise<T> {
  return work();
}
