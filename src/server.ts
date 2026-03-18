import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Game API',
      version: '1.0.0',
      description: 'مستندات APIهای بک‌اند بازی',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
      },
    ],
  },
  // مسیر فایل‌هایی که دارای کامنت‌های Swagger هستند
  apis: ['./src/server.ts'], 
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /api/auth/guest:
 *   post:
 *     summary: ایجاد کاربر مهمان
 *     description: یک کاربر مهمان با نام تصادفی در دیتابیس ایجاد می‌کند.
 *     responses:
 *       200:
 *         description: کاربر مهمان با موفقیت ساخته شد.
 *       500:
 *         description: خطای سرور یا دیتابیس.
 */
app.post('/api/auth/guest', async (req, res) => {
  try {
    const randomNum = Math.floor(Math.random() * 10000);
    const guestUsername = `Guest_${randomNum}`;

    const guestUser = await prisma.user.create({
      data: {
        is_guest: true,
        username: guestUsername,
        coins: 0,
        mmr: 1000,
      },
    });
    
    res.json({ 
      success: true, 
      message: 'کاربر مهمان ساخته شد',
      user: guestUser 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'خطا در ارتباط با دیتابیس' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});
