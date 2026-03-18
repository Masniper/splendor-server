import swaggerJsdoc from 'swagger-jsdoc';

const PORT = process.env.PORT || 5001;

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Game API',
      version: '1.0.0',
      description: 'Game backend API documentation',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
      },
    ],
    // Add Security Schemes for JWT
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    // Apply security globally (optional, but good for testing)
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts', './src/server.ts'], 
};

export const swaggerDocs = swaggerJsdoc(swaggerOptions);
