interface Response {
  returnValue: true;
}

interface ErrorResponse {
  returnValue: false;
  errorText: string;
}

export function makeSuccess(payload: Record<string, any>): Response {
  return { returnValue: true, ...payload };
}

export function makeError(error: string, payload?: Record<string, any>): ErrorResponse {
  return { returnValue: false, errorText: error, ...payload };
}
