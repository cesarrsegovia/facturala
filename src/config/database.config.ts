import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Configuracion de conexion a postgreSQL via typeORM.
 *
 * Se registra bajo el namespace "database" y se lee con "config.get)'database'".
 * - `synchronize` solo en desarrollo: crea/actualiza tablas desde las entidades.
 *  En produccion se usan migraciones (nunca synchronize, riesgo de perdida de datos)
 * -  `ssl` se exige en produccion (railway) pero no en local
 */

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: process.env.NODE_ENV !== 'production',
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
}));
