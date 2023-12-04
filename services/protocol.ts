type Response<T extends Record<string, any>> = T & {
  returnValue: true;
};

type ErrorResponse<T extends Record<string, any>> = T & {
  returnValue: false;
  errorText: string;
};

export function makeSuccess<T>(payload: T): Response<T> {
  return { returnValue: true, ...payload };
}

export function makeError<T>(error: string, payload?: T): ErrorResponse<T> {
  return { returnValue: false, errorText: error, ...payload };
}
