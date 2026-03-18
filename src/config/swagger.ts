import swaggerJsdoc from 'swagger-jsdoc';

const PORT = process.env.PORT || 5001;

const swaggerOptions = {
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
  },
  // Path to the files containing Swagger annotations
  apis: ['./src/routes/*.ts'], 
};

export const swaggerDocs = swaggerJsdoc(swaggerOptions);
