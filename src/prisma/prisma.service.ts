import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Conexión a PostgreSQL establecida exitosamente');
    } catch (error) {
      console.error('❌ Error conectando a la base de datos:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('🔌 Conexión a PostgreSQL cerrada');
  }

  // Método helper para transacciones
  async executeTransaction<T>(
    fn: (
      prisma: Omit<
        this,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
      >,
    ) => Promise<T>,
  ): Promise<T> {
    return await this.$transaction(fn);
  }

  // Método helper para limpiar todas las tablas
  async cleanDatabase() {
    const tablenames = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations')
      .map((name) => `"public"."${name}"`)
      .join(', ');

    try {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
      console.log('🧹 Base de datos limpiada');
    } catch (error) {
      console.log('⚠️  Error limpiando la base de datos:', error);
    }
  }

  // Método helper para verificar el estado de la conexión
  async healthCheck(): Promise<{ database: string; status: string }> {
    try {
      await this.$queryRaw`SELECT 1`;
      return {
        database: 'PostgreSQL',
        status: 'connected',
      };
    } catch (error) {
      return {
        database: 'PostgreSQL',
        status: 'disconnected',
      };
    }
  }
}
