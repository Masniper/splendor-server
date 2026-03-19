import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

type SchemaMap = {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
};

export function validate(schemas: SchemaMap) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }
      next();
    } catch (error: any) {
      const message =
        error?.issues?.[0]?.message || "Invalid request data.";
      res.status(400).json({ success: false, error: message });
    }
  };
}
