export function createChatQueue(handle) {
  let tail = Promise.resolve();
  return (...args) => {
    const result = tail.then(() => handle(...args));
    tail = result.catch(() => {});
    return result;
  };
}
