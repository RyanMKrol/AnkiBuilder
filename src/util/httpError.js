// A plain Error carrying an HTTP `status`, so library helpers (audio generation, card writes) can
// signal the right response code without depending on the server layer. The server maps `.status`
// to the response (defaulting to 500 when absent).
export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
