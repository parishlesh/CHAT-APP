export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "AppError";
  }
}

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
