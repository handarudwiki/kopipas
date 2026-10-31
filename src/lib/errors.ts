export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
export const unauthorized = (msg = "Tidak terautentikasi") => new ApiError(401, msg);
export const forbidden = (msg = "Aksi tidak diizinkan untuk peran Anda") => new ApiError(403, msg);
export const notFound = (msg = "Data tidak ditemukan") => new ApiError(404, msg);
export const conflict = (msg: string, details?: unknown) => new ApiError(409, msg, details);
export const unprocessable = (msg: string, details?: unknown) => new ApiError(422, msg, details);
