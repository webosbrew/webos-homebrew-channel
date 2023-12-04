type Response<T extends Record<string, any>> = T & {
  returnValue: true;
};

// eslint-disable-next-line @typescript-eslint/no-redeclare
type Error<T extends Record<string, any>> = T & {
  returnValue: false;
  errorText: string;
};

export function makeSuccess<T>(payload: T): Response<T> {
  return { returnValue: true, ...payload };
}

export function makeError<T>(error: string, payload?: T): Error<T> {
  return { returnValue: false, errorText: error, ...payload };
}
